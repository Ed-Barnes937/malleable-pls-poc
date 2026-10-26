import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'

export function registerJobsHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('jobs.recent', (input) => {
    const limit = (input as number | undefined) ?? 5
    // The simulator never auto-retries, so every failed run is retryable by hand.
    return [...db.jobRuns]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((j) => ({ ...j, retryable: j.status === 'failed' }))
  })

  router.register('jobs.retry', (input) => {
    const job = db.jobRuns.find((j) => j.id === input && j.status === 'failed')
    if (!job) throw new Error('No failed job to retry')
    Object.assign(job, { status: 'pending', error: null, output: null, started_at: null, completed_at: null })
    return { id: job.id }
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
