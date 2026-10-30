import { LECTURE_SUMMARY_ANCHOR } from '@pls/substrate'
import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'
import { inScope, isScoped, segmentRecordingId } from './course-scope'

export function registerAnnotationsHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('annotations.list', (input) => {
    const opts = input as { courseTag?: string; lectureId?: string; recordingId?: string } | undefined
    const scoped = isScoped(opts)

    return db.annotations
      .filter((a) => {
        if (!scoped) return true
        // Notes on in-scope moments and the summaries of in-scope recordings (as on the server).
        if (a.anchor_type === LECTURE_SUMMARY_ANCHOR) return inScope(db, opts, a.anchor_id)
        if (a.anchor_type !== 'transcript_segment') return false
        const recordingId = segmentRecordingId(db, a.anchor_id)
        return !!recordingId && inScope(db, opts, recordingId)
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
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
