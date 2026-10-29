import type { TransactionSql } from 'postgres'
import { withUser } from '@pls/db'
import {
  planAutofillInput,
  planCapacity,
  planTasks,
  sanitizeAdvice,
  weekLayout,
  type PlanAdvice,
} from '@pls/substrate'
import { router, publicProcedure } from '../trpc'
import { listPlanItems } from '../plan-items/store'
import { getPreferences, placementTimeZone } from '../preferences/store'
import { planAutofillTask } from '../ai/tasks/plan-autofill'

const WEAK_TOPIC_LIMIT = 8
/** Below this average "how sure you feel" score a moment counts as a weak topic. */
const WEAK_CONFIDENCE = 50

/** Moments the student marked confusing or felt unsure about, most recent lectures first. */
async function weakTopics(tx: TransactionSql, userId: string): Promise<string[]> {
  const rows = await tx`
    SELECT ts.text FROM transcript_segments ts
    JOIN recordings r ON r.id = ts.recording_id
    WHERE ts.user_id = ${userId} AND (
      EXISTS (
        SELECT 1 FROM tags t
        WHERE t.user_id = ${userId} AND t.target_type = 'transcript_segment'
          AND t.target_id = ts.id AND t.label = 'confused'
      )
      OR (
        SELECT AVG(cs.score) FROM confidence_signals cs
        WHERE cs.user_id = ${userId} AND cs.target_type = 'transcript_segment' AND cs.target_id = ts.id
      ) < ${WEAK_CONFIDENCE}
    )
    ORDER BY r.created_at DESC, ts.start_ms
    LIMIT ${WEAK_TOPIC_LIMIT}
  `
  return rows.map((r) => r.text as string)
}

export const planningRouter = router({
  /**
   * Help me plan's Auto-fill advice for a week: a priority order over the
   * unscheduled open to-dos, trims when over capacity, and one short note.
   * Writes nothing and places nothing: the Calendar places the ghosts with
   * `draftPlan` (the same scheduler code, so it is deterministic), and only
   * blocks the student accepts are saved, through `planItems.update`.
   */
  autofill: publicProcedure
    .input(planAutofillInput)
    .mutation(async ({ ctx, input }): Promise<PlanAdvice> => {
      const now = Date.now()
      const week = { start: Date.parse(input.from), end: Date.parse(input.to) }
      const loaded = await withUser(ctx.userId, async (tx) => ({
        // Every course: scope never changes what is busy or what needs doing.
        rows: await listPlanItems(tx, ctx.userId, { from: input.from, to: input.to, statuses: ['open', 'done'] }),
        todos: await listPlanItems(tx, ctx.userId, { kinds: ['task'], statuses: ['open'], scheduled: false }),
        weak: await weakTopics(tx, ctx.userId),
        // The student's study hours and daily budget, not the client's say-so.
        prefs: await getPreferences(tx, ctx.userId),
      }))
      const tasks = planTasks(loaded.todos, week, { now, estimates: input.estimates, weakTopics: loaded.weak })
      if (tasks.length === 0) return { order: [], trims: [], note: null }
      const { prefs } = loaded
      const timeZone = placementTimeZone(prefs, input.timeZone)
      const layout = weekLayout(loaded.rows, week, {
        timeZone,
        studyHours: prefs.study_hours,
        studyMinPerDay: prefs.study_min_per_day,
      })
      const cap = planCapacity(layout, tasks, now)
      // Outside the transaction: never hold a DB connection across a model call.
      const raw = await ctx.ai.llm.run(planAutofillTask, {
        tasks,
        freeMin: cap.freeMin,
        neededMin: cap.neededMin,
        minutesPerDay: prefs.study_min_per_day,
        weakTopics: loaded.weak,
        timeZone,
      })
      return sanitizeAdvice(raw, tasks, cap, prefs.study_min_per_day)
    }),
})
