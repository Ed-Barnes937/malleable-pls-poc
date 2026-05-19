import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'

export function registerRecordingsHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('recordings.list', (input) => {
    const opts = input as { courseTag?: string; recordingId?: string } | undefined

    if (opts?.recordingId) {
      return db.recordings.filter((r) => r.id === opts.recordingId)
    }

    if (opts?.courseTag) {
      const taggedIds = new Set(
        db.tags
          .filter((t) => t.target_type === 'recording' && t.label === opts.courseTag)
          .map((t) => t.target_id),
      )
      return db.recordings
        .filter((r) => taggedIds.has(r.id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    }

    return [...db.recordings].sort((a, b) => b.created_at.localeCompare(a.created_at))
  })

  router.register('recordings.byId', (input) => {
    const id = input as string
    return db.recordings.find((r) => r.id === id) ?? null
  })
}
