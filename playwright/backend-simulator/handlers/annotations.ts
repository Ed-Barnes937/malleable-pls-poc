import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'

export function registerAnnotationsHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('annotations.list', (input) => {
    const opts = input as { courseTag?: string; recordingId?: string; timeframe?: string } | undefined

    if (opts?.recordingId) {
      const segmentIds = new Set(
        db.transcriptSegments
          .filter((s) => s.recording_id === opts.recordingId)
          .map((s) => s.id),
      )
      return db.annotations
        .filter((a) => a.anchor_type === 'transcript_segment' && segmentIds.has(a.anchor_id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    }

    return [...db.annotations].sort((a, b) => b.created_at.localeCompare(a.created_at))
  })

  router.register('annotations.create', (input) => {
    const { anchor_type, anchor_id, anchor_start_ms, anchor_end_ms, body } = input as {
      anchor_type: string; anchor_id: string; anchor_start_ms?: number; anchor_end_ms?: number; body: string
    }
    const annotation = {
      id: `ann-${crypto.randomUUID().slice(0, 8)}`,
      anchor_type,
      anchor_id,
      anchor_start_ms: anchor_start_ms ?? null,
      anchor_end_ms: anchor_end_ms ?? null,
      body,
      created_at: new Date().toISOString(),
      author_id: 'dev-user-1',
    }
    db.annotations.push(annotation)
    return annotation
  })
}
