import { SimulatorError, type ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'
import { inScope, isScoped, segmentRecordingId } from './course-scope'

export function registerTagsHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('tags.list', (input) => {
    const opts = input as { courseTag?: string; lectureId?: string; recordingId?: string } | undefined
    const recordingOf = (t: { target_type: string; target_id: string }) =>
      t.target_type === 'transcript_segment'
        ? segmentRecordingId(db, t.target_id)
        : t.target_type === 'recording' ? t.target_id : undefined

    return db.tags
      // In scope when its segment's (or its own) recording is, as on the server.
      .filter((t) => !isScoped(opts) || (!!recordingOf(t) && inScope(db, opts, recordingOf(t))))
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
    // As the server: a recording's course is its lecture's, never a tag.
    if (target_type === 'recording' && ['biology', 'chemistry', 'physics'].includes(label)) {
      throw new SimulatorError('BAD_REQUEST', "A recording's course is its lecture's")
    }
    // As the server: a plan item's course is its own column, never a tag.
    if (target_type === 'plan_item' && ['biology', 'chemistry', 'physics'].includes(label)) {
      throw new SimulatorError('BAD_REQUEST', "A plan item's course is set on the item")
    }
    if (label === 'sorted') throw new SimulatorError('BAD_REQUEST', 'Mark a moment sorted with tags.sort')
    // As the server: once per (target, label).
    const existing = db.tags.find((t) => t.target_type === target_type && t.target_id === target_id && t.label === label)
    if (existing) return { ...existing, automations_started: 0 }
    const tag = {
      id: `tag-${crypto.randomUUID().slice(0, 8)}`,
      target_type,
      target_id,
      label,
      created_at: new Date().toISOString(),
    }
    db.tags.push(tag)
    // As the server: how many automations the tag starts (the simulator runs
    // none of them; jobs are its tests' to fake).
    const fields: Record<string, string> = { target_type, target_id, label }
    const started = db.workflows.filter((w) => w.enabled && w.trigger_event === 'tag:created'
      && (w.condition_field == null || fields[w.condition_field] === w.condition_value)).length
    return { ...tag, automations_started: started }
  })

  router.register('tags.delete', (input) => {
    const id = input as string
    const idx = db.tags.findIndex((t) => t.id === id)
    if (idx >= 0) db.tags.splice(idx, 1)
  })

  // As the server's tags.sort / tags.unsort: the moment's review to-dos are
  // the ones linked to its recording and offset.
  const reviewsOf = (segmentId: string, status: string) => {
    const seg = db.transcriptSegments.find((s) => s.id === segmentId)
    if (!seg) throw new SimulatorError('NOT_FOUND', 'That moment is gone')
    return db.planItems.filter((p) =>
      p.kind === 'task' && p.subtype === 'review' && p.status === status
      && p.source_type === 'recording' && p.source_id === seg.recording_id && p.source_offset_ms === seg.start_ms)
  }

  router.register('tags.sort', (input) => {
    const { segmentId } = input as { segmentId: string }
    const open = reviewsOf(segmentId, 'open')
    let tag = db.tags.find((t) => t.target_type === 'transcript_segment' && t.target_id === segmentId && t.label === 'sorted')
    if (!tag) {
      tag = { id: `tag-${crypto.randomUUID().slice(0, 8)}`, target_type: 'transcript_segment', target_id: segmentId, label: 'sorted', created_at: new Date().toISOString() }
      db.tags.push(tag)
    }
    for (const p of open) Object.assign(p, { status: 'dismissed', updated_at: new Date().toISOString() })
    return { tag, dismissed: open.map((p) => p.id) }
  })

  const momentTags = (segmentId: string, label: string) =>
    db.tags.filter((t) => t.target_type === 'transcript_segment' && t.target_id === segmentId && t.label === label)
  const dropTags = (segmentId: string, label: string) => {
    for (let i = db.tags.length - 1; i >= 0; i--) {
      const t = db.tags[i]
      if (t.target_type === 'transcript_segment' && t.target_id === segmentId && t.label === label) db.tags.splice(i, 1)
    }
  }

  router.register('tags.unmarkConfused', (input) => {
    const { segmentId } = input as { segmentId: string }
    const open = reviewsOf(segmentId, 'open')
    if (momentTags(segmentId, 'sorted').length > 0) throw new SimulatorError('CONFLICT', 'A sorted moment keeps its confusing mark')
    const confused = momentTags(segmentId, 'confused').sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1)
    if (!confused) return { confusedAt: null, dismissed: [] }
    dropTags(segmentId, 'confused')
    for (const p of open) Object.assign(p, { status: 'dismissed', updated_at: new Date().toISOString() })
    return { confusedAt: confused.created_at, dismissed: open.map((p) => p.id) }
  })

  router.register('tags.remarkConfused', (input) => {
    const { segmentId, confusedAt, restore } = input as { segmentId: string; confusedAt: string; restore?: string[] }
    if (momentTags(segmentId, 'confused').length > 0 || reviewsOf(segmentId, 'open').length > 0) return { restored: [] }
    const dismissed = reviewsOf(segmentId, 'dismissed').filter((p) => restore?.includes(p.id))
    db.tags.push({ id: `tag-${crypto.randomUUID().slice(0, 8)}`, target_type: 'transcript_segment', target_id: segmentId, label: 'confused', created_at: confusedAt })
    for (const p of dismissed) Object.assign(p, { status: 'open', updated_at: new Date().toISOString() })
    return { restored: dismissed.map((p) => p.id) }
  })

  router.register('tags.unsort', (input) => {
    const { segmentId, restore } = input as { segmentId: string; restore?: string[] }
    const dismissed = reviewsOf(segmentId, 'dismissed').filter((p) => restore?.includes(p.id))
    for (let i = db.tags.length - 1; i >= 0; i--) {
      const t = db.tags[i]
      if (t.target_type === 'transcript_segment' && t.target_id === segmentId && t.label === 'sorted') db.tags.splice(i, 1)
    }
    for (const p of dismissed) Object.assign(p, { status: 'open', updated_at: new Date().toISOString() })
    return { restored: dismissed.map((p) => p.id) }
  })
}
