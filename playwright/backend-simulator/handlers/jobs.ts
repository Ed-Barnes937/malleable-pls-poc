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
}
