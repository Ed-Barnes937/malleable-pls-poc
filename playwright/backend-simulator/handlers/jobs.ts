import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'

export function registerJobsHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('jobs.recent', (input) => {
    const limit = (input as number | undefined) ?? 5
    return [...db.jobRuns]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
  })

  router.register('jobs.runningCount', () => {
    return db.jobRuns.filter(
      (j) => j.status === 'pending' || j.status === 'running',
    ).length
  })

  router.register('jobs.forWorkflow', (input) => {
    const { workflowId, limit } = input as { workflowId: string; limit?: number }
    return [...db.jobRuns]
      .filter((j) => j.workflow_id === workflowId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit ?? 10)
  })
}
