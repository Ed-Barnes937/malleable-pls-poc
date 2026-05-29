import type { TransactionSql } from 'postgres'
import { createWorkflowEngine } from '@pls/workflows'
import { createPgAdapter } from './pg-adapter'

/**
 * Thin wrapper preserving the existing `dispatchWorkflows(tx, userId, ...)`
 * call sites while delegating the matching / depth-guard / cascade logic to the
 * shared `@pls/workflows` engine.
 *
 * The pg adapter closes over the caller's `tx` + `userId`; `workspaceId` is
 * passed as the engine `scopeId` (used for workspace-override resolution).
 *
 * The adapter injects `_userId` into every enqueued job's input so it persists
 * in the job_runs `input` column and is available to executors (which open
 * their own RLS-scoped transaction via `withUser`) when the job is claimed.
 */
export async function dispatchWorkflows(
  tx: TransactionSql,
  userId: string,
  eventType: string,
  payload: Record<string, unknown>,
  workspaceId: string | null,
  depth = 0,
): Promise<string[]> {
  const adapter = createPgAdapter({ sql: tx, userId })
  const engine = createWorkflowEngine({ adapter })
  const result = await engine.dispatch(
    { type: eventType, payload },
    { scopeId: workspaceId, depth },
  )
  return result.enqueuedJobIds
}
