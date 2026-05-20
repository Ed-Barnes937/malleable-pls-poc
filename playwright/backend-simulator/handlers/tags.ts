import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'

export function registerTagsHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('tags.list', (input) => {
    const opts = input as { courseTag?: string; recordingId?: string; timeframe?: string } | undefined

    if (opts?.recordingId) {
      const segmentIds = new Set(
        db.transcriptSegments
          .filter((s) => s.recording_id === opts.recordingId)
          .map((s) => s.id),
      )
      return db.tags
        .filter((t) => t.target_type === 'transcript_segment' && segmentIds.has(t.target_id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    }

    return [...db.tags].sort((a, b) => b.created_at.localeCompare(a.created_at))
  })

  router.register('tags.forTarget', (input) => {
    const { targetType, targetId } = input as { targetType: string; targetId: string }
    return db.tags.filter((t) => t.target_type === targetType && t.target_id === targetId)
  })

  router.register('tags.create', (input) => {
    const { target_type, target_id, label } = input as {
      target_type: string; target_id: string; label: string
    }
    const tag = {
      id: `tag-${crypto.randomUUID().slice(0, 8)}`,
      target_type,
      target_id,
      label,
      created_at: new Date().toISOString(),
    }
    db.tags.push(tag)
    return tag
  })

  router.register('tags.delete', (input) => {
    const id = input as string
    const idx = db.tags.findIndex((t) => t.id === id)
    if (idx >= 0) db.tags.splice(idx, 1)
  })
}
