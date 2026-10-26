import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'
import { inCourse, segmentRecordingId } from './course-scope'

export function registerTagsHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('tags.list', (input) => {
    const opts = input as { courseTag?: string; recordingId?: string } | undefined
    const recordingOf = (t: { target_type: string; target_id: string }) =>
      t.target_type === 'transcript_segment'
        ? segmentRecordingId(db, t.target_id)
        : t.target_type === 'recording' ? t.target_id : undefined

    return db.tags
      .filter((t) => !opts?.recordingId || (t.target_type === 'transcript_segment' && recordingOf(t) === opts.recordingId))
      .filter((t) => !opts?.courseTag || inCourse(db, opts.courseTag, 'recording', recordingOf(t)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
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
