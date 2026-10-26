import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'
import { inCourse, segmentRecordingId } from './course-scope'

export function registerAnnotationsHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('annotations.list', (input) => {
    const opts = input as { courseTag?: string; recordingId?: string } | undefined
    const scoped = Boolean(opts?.recordingId || opts?.courseTag)

    return db.annotations
      .filter((a) => {
        if (!scoped) return true
        if (a.anchor_type !== 'transcript_segment') return false
        const recordingId = segmentRecordingId(db, a.anchor_id)
        if (opts?.recordingId && recordingId !== opts.recordingId) return false
        return !opts?.courseTag || inCourse(db, opts.courseTag, 'recording', recordingId)
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
