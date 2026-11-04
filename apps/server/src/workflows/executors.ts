import path from 'path'
import { withUser, type TxSql } from '@pls/db'
import { createExecutorRegistry, type ExecutorRegistry } from '@pls/workflows'
import { parseReviewParams, REVIEW_TASK_JOB, LECTURE_SUMMARY_ANCHOR } from '@pls/substrate'
import type { AiDeps } from '../ai/deps'
import { lectureSummaryTask, summaryBody } from '../ai/tasks/lecture-summary'
import { reviewTask, reviewTitle } from '../ai/tasks/review-task'
import { eventPayload } from '../plan-items/store'
import { createReview, findOpenReview, loadMoment } from '../planning/review-automation'
import { uploadsDir } from '../uploaded-files'

/** The owning user, injected into every job's input at dispatch (see pg-adapter). */
function requireUser(input: Record<string, unknown>, jobType: string): string {
  const userId = input._userId as string | undefined
  if (!userId) throw new Error(`${jobType} requires input._userId - refusing to report success without writing anything`)
  return userId
}

// Recording status once its transcript is written. Matches the seeded,
// already-transcribed recordings (see chk_recordings_status for the allowed set).
const TRANSCRIBED_STATUS = 'ready'

/**
 * A run whose recording is gone (its lecture was deleted, before or while it
 * ran): done, with nothing to do, rather than a failed job in Activity.
 */
function recordingDeleted(recordingId: string) {
  return { output: { recording_id: recordingId, skipped: 'recording deleted', quiet: true } }
}

/**
 * Whether the recording is still there, held (FOR KEY SHARE) until the
 * transaction ends so it can't be deleted under the writes that follow:
 * an AI call can take a while, and the lecture may be deleted meanwhile.
 */
async function holdRecording(tx: TxSql, recordingId: string): Promise<boolean> {
  const [row] = await tx`SELECT 1 FROM recordings WHERE id = ${recordingId} FOR KEY SHARE`
  return !!row
}

/**
 * Builds the executor registry for the server runtime. Executor bodies remain
 * server-specific (AI providers / direct postgres writes); only the registry
 * and the `(input, ctx) => Promise<JobResult>` signature are adopted from
 * `@pls/workflows`. AI capabilities arrive through `ai` (never constructed
 * here), so tests and mock runs cannot reach a real provider. The owning user
 * is carried in `input._userId` (injected at dispatch time) so executors can
 * open their own RLS-scoped tx via `withUser`.
 */
export function createServerExecutors(ai: AiDeps): ExecutorRegistry {
  const { transcriber, llm } = ai
  const serverExecutors = createExecutorRegistry()

  serverExecutors.register(
    'ai:transcribe',
    async (input) => {
      const recordingId = (input.recording_id ?? input.target_id) as string
      const userId = requireUser(input, 'ai:transcribe')

      const [recording] = await withUser(userId, (tx) => tx`
        SELECT audio_url, status,
               EXISTS (SELECT 1 FROM transcript_segments WHERE recording_id = ${recordingId}) AS transcribed
        FROM recordings WHERE id = ${recordingId}
      `)
      if (!recording) return recordingDeleted(recordingId)
      // Already transcribed, even if nothing was said ('ready'), or has its
      // segments (e.g. a failed run retried after a manual "Transcribe it"
      // worked): don't bill the provider or duplicate segments. This check is
      // unlocked and relies on per-user serial job execution.
      if (recording.transcribed || recording.status === TRANSCRIBED_STATUS) {
        return { output: { recording_id: recordingId, skipped: 'already transcribed' } }
      }

      const audioUrl = (recording.audio_url as string | null) ?? ''
      let segments: Awaited<ReturnType<typeof transcriber.transcribe>>
      try {
        segments = await transcriber.transcribe(path.join(uploadsDir(), path.basename(audioUrl)))
      } catch (err) {
        // Its lecture deleted while this ran: the audio file went with it,
        // so a transcriber that reads it late fails. Not a failed job.
        const [still] = await withUser(userId, (tx) => tx`SELECT 1 FROM recordings WHERE id = ${recordingId}`)
        if (!still) return recordingDeleted(recordingId)
        throw err
      }

      const written = await withUser(userId, async (tx) => {
        if (!(await holdRecording(tx, recordingId))) return false
        for (const seg of segments) {
          await tx`
            INSERT INTO transcript_segments (user_id, recording_id, start_ms, end_ms, text, speaker)
            VALUES (${userId}, ${recordingId}, ${seg.startMs}, ${seg.endMs}, ${seg.text}, ${seg.speaker})
          `
        }
        await tx`UPDATE recordings SET status = ${TRANSCRIBED_STATUS} WHERE id = ${recordingId}`
        return true
      })
      if (!written) return recordingDeleted(recordingId)

      return {
        output: { recording_id: recordingId, segment_count: segments.length, status: 'transcribed' },
        // Cascades to the lecture summary (and anything else waiting on a transcript).
        events: [{ type: 'recording:transcribed', payload: { recording_id: recordingId } }],
      }
    },
    // Never auto-retry: a provider call that timed out may still be billed.
    // A failed run can be retried by hand.
    { label: 'Transcribe', category: 'ai', maxRetries: 0 },
  )

  serverExecutors.register(
    'ai:summarize-lecture',
    async (input) => {
      const recordingId = (input.recording_id ?? input.target_id) as string
      const userId = requireUser(input, 'ai:summarize-lecture')

      const found = await withUser(userId, async (tx) => {
        const [recording] = await tx`SELECT title FROM recordings WHERE id = ${recordingId}`
        if (!recording) return null
        const segments = await tx`
          SELECT text FROM transcript_segments WHERE recording_id = ${recordingId} ORDER BY start_ms
        `
        return { title: recording.title as string, transcript: segments.map((s) => s.text as string).join('\n') }
      })
      if (!found) return recordingDeleted(recordingId)
      const { title, transcript } = found
      if (!transcript.trim()) {
        return { output: { recording_id: recordingId, skipped: 'no transcript' } }
      }

      const { lines } = await llm.run(lectureSummaryTask, { lectureTitle: title, transcript })
      const body = summaryBody(lines)
      if (!body) throw new Error('lecture-summary returned no usable lines')

      // One summary per lecture: an annotation anchored to the whole recording.
      const written = await withUser(userId, async (tx) => {
        if (!(await holdRecording(tx, recordingId))) return false
        await tx`DELETE FROM annotations WHERE anchor_type = ${LECTURE_SUMMARY_ANCHOR} AND anchor_id = ${recordingId}`
        await tx`
          INSERT INTO annotations (user_id, anchor_type, anchor_id, body)
          VALUES (${userId}, ${LECTURE_SUMMARY_ANCHOR}, ${recordingId}, ${body})
        `
        return true
      })
      if (!written) return recordingDeleted(recordingId)
      return { output: { recording_id: recordingId, lines: body.split('\n').length } }
    },
    { label: 'Summarise lecture', category: 'ai', maxRetries: 0 },
  )

  serverExecutors.register(
    REVIEW_TASK_JOB,
    async (input, ctx) => {
      const userId = requireUser(input, REVIEW_TASK_JOB)
      if (input.target_type !== 'transcript_segment') {
        return { output: { skipped: 'not a transcript moment' } }
      }
      const segmentId = input.target_id as string

      const found = await withUser(userId, async (tx) => {
        const moment = await loadMoment(tx, segmentId)
        if (!moment) return null
        const [job] = await tx`
          SELECT params FROM workflow_jobs
          WHERE workflow_id = ${ctx.jobRun.workflow_id} AND job_type = ${REVIEW_TASK_JOB}
          ORDER BY (id = ${ctx.jobRun.workflow_job_id}) DESC, sort_order
          LIMIT 1
        `
        return { moment, existing: await findOpenReview(tx, userId, moment), params: parseReviewParams(job?.params) }
      })
      // The moment went (its lecture was deleted) before this ran.
      if (!found) return { output: { skipped: 'moment deleted', quiet: true } }
      const { moment, existing, params } = found
      // Marking a moment again adds nothing. The run records which review it
      // matched but not where that review is now: only the run that created a
      // review records its placement (see replaceAutomationReviews).
      const alreadyReviewed = (id: string) => ({
        output: { existing_plan_item_id: id, deduplicated: true, quiet: true },
      })
      if (existing) return alreadyReviewed(existing.id)

      const taskInput = { lectureTitle: moment.recordingTitle, moment: moment.text, before: moment.before, after: moment.after }
      const { topic } = await llm.run(reviewTask, taskInput)
      const title = reviewTitle(topic, taskInput)

      const result = await withUser(userId, async (tx) =>
        // Or while the review title was being written: no study block for a moment that is gone.
        (await holdRecording(tx, moment.recordingId))
          ? createReview(tx, userId, { moment, title, params, now: Date.now(), workflowId: ctx.jobRun.workflow_id })
          : null,
      )
      if (!result) return { output: { skipped: 'moment deleted', quiet: true } }
      if (!result.created) return alreadyReviewed(result.item.id)
      const { item, slot } = result
      return {
        output: {
          plan_item_id: item.id,
          title: item.title,
          starts_at: item.starts_at,
          ends_at: item.ends_at,
          ...(slot && 'reason' in slot ? { unplaced_reason: slot.reason } : {}),
        },
        events: [{ type: 'plan-item:created', payload: eventPayload(item) }],
      }
    },
    { label: 'Add review', category: 'plan', maxRetries: 0 },
  )

  return serverExecutors
}
