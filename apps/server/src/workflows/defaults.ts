import type { JSONValue, TransactionSql } from 'postgres'
import { withUser } from '@pls/db'
import { REVIEW_TASK_JOB } from '@pls/substrate'

/**
 * The automations every account starts with. Accounts that existed before
 * migration 017 have no marker, so they get them (if they have none) on their
 * first visit, the same way.
 *
 * The review's day boundaries use Europe/London until the student has a time
 * zone preference (see migration 013).
 */
export const DEFAULT_AUTOMATIONS = [
  {
    sourceLens: 'audio-capture', triggerEvent: 'recording:completed',
    job: { jobType: 'ai:transcribe', params: {} },
  },
  {
    sourceLens: 'audio-capture', triggerEvent: 'recording:transcribed',
    job: { jobType: 'ai:summarize-lecture', params: {} },
  },
  {
    sourceLens: 'transcript', triggerEvent: 'tag:created', conditionField: 'label', conditionValue: 'confused',
    job: { jobType: REVIEW_TASK_JOB, params: { durationMin: 20, windowDays: 3, timeZone: 'Europe/London' } },
  },
] as const

/**
 * Gives an account the default automations the first time it is seen, once:
 * `user_provisioning` records that it was done, so one the student deletes
 * stays deleted. An account that already has automations (the seeded demo
 * account) is marked and left as it is. Safe to call concurrently: the marker
 * insert serialises, and only the call that wins it adds anything.
 */
export async function ensureDefaultAutomations(tx: TransactionSql, userId: string): Promise<void> {
  const marked = await tx`
    INSERT INTO user_provisioning (user_id) VALUES (${userId})
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id
  `
  if (marked.length === 0) return

  const [{ count }] = await tx`SELECT count(*)::int AS count FROM workflows WHERE user_id = ${userId}`
  if (count > 0) return

  for (const a of DEFAULT_AUTOMATIONS) {
    const [workflow] = await tx`
      INSERT INTO workflows (user_id, source_lens, trigger_event, condition_field, condition_value, enabled, workspace_id)
      VALUES (${userId}, ${a.sourceLens}, ${a.triggerEvent},
              ${'conditionField' in a ? a.conditionField : null}, ${'conditionValue' in a ? a.conditionValue : null}, true, NULL)
      RETURNING id
    `
    await tx`
      INSERT INTO workflow_jobs (user_id, workflow_id, job_type, params, sort_order, delay_ms)
      VALUES (${userId}, ${workflow!.id as string}, ${a.job.jobType}, ${tx.json(a.job.params as JSONValue)}, 0, 0)
    `
  }
}

/** `ensureDefaultAutomations` in its own transaction: one cheap marker insert per request once an account is done. */
export async function provisionAccount(userId: string): Promise<void> {
  await withUser(userId, (tx) => ensureDefaultAutomations(tx, userId))
}
