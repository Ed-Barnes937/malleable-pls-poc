/**
 * Parity guard for the backend simulator.
 *
 * Runs every read procedure against the simulator with default seed data and
 * asserts it returns data rather than a NOT_FOUND or INTERNAL_SERVER_ERROR.
 *
 * Known gaps (procedures present on the real server but missing here):
 *   - workspaces.reorder       → returns NOT_FOUND in simulator
 *   - workspaces.updatePanelConfig → returns NOT_FOUND in simulator
 *
 * Known behaviour drift:
 *   - workflows.dispatch: simulator always returns { enqueuedJobIds: [] } —
 *     no workflow engine is wired; server dispatches real jobs.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ProcedureRouter, handleTrpcRequest } from './trpc-protocol'
import { InMemoryDb } from './in-memory-db'
import { createDefaultSeedData } from './seed-data'
import { registerWorkspacesHandlers } from './handlers/workspaces'
import { registerRecordingsHandlers } from './handlers/recordings'
import { registerLecturesHandlers } from './handlers/lectures'
import { registerTranscriptsHandlers } from './handlers/transcripts'
import { registerTagsHandlers } from './handlers/tags'
import { registerJobsHandlers } from './handlers/jobs'
import { registerAnnotationsHandlers } from './handlers/annotations'
import { registerConfidenceHandlers } from './handlers/confidence'
import { registerLinksHandlers } from './handlers/links'
import { registerAggregatesHandlers } from './handlers/aggregates'
import { registerWorkflowsHandlers } from './handlers/workflows'
import { registerPlanItemsHandlers } from './handlers/plan-items'
import { registerPreferencesHandlers } from './handlers/preferences'

const BASE_URL = 'http://localhost:3999/trpc'

function makeRouter(): ProcedureRouter {
  const db = new InMemoryDb(createDefaultSeedData())
  const router = new ProcedureRouter()
  registerWorkspacesHandlers(router, db)
  registerRecordingsHandlers(router, db)
  registerLecturesHandlers(router, db)
  registerTranscriptsHandlers(router, db)
  registerTagsHandlers(router, db)
  registerJobsHandlers(router, db)
  registerAnnotationsHandlers(router, db)
  registerConfidenceHandlers(router, db)
  registerLinksHandlers(router, db)
  registerAggregatesHandlers(router, db)
  registerWorkflowsHandlers(router, db)
  registerPlanItemsHandlers(router, db)
  registerPreferencesHandlers(router, db)
  return router
}

async function query(router: ProcedureRouter, path: string, input?: unknown): Promise<unknown> {
  const inputParam = input !== undefined
    ? `?batch=1&input=${encodeURIComponent(JSON.stringify({ '0': { json: input } }))}`
    : '?batch=1'
  const url = `${BASE_URL}/${path}${inputParam}`
  const result = await handleTrpcRequest(url, 'GET', undefined, router)
  const parsed = JSON.parse(result.body)
  const item = Array.isArray(parsed) ? parsed[0] : parsed
  if (item?.error) throw new Error(`${path}: ${item.error.message ?? JSON.stringify(item.error)}`)
  const data = item?.result?.data
  return data && typeof data === 'object' && 'json' in data ? data.json : data
}

async function mutate(router: ProcedureRouter, path: string, input: unknown): Promise<unknown> {
  const body = JSON.stringify({ '0': { json: input } })
  const result = await handleTrpcRequest(`${BASE_URL}/${path}?batch=1`, 'POST', body, router)
  const parsed = JSON.parse(result.body)
  const item = Array.isArray(parsed) ? parsed[0] : parsed
  if (item?.error) throw new Error(`${path}: ${item.error.message ?? JSON.stringify(item.error)}`)
  return item?.result?.data?.json
}

describe('simulator parity — read procedures return data on default seed', () => {
  let router: ProcedureRouter

  beforeEach(() => {
    router = makeRouter()
  })

  it('recordings.list', async () => {
    const data = await query(router, 'recordings.list')
    expect(Array.isArray(data)).toBe(true)
    expect((data as unknown[]).length).toBeGreaterThan(0)
  })

  it('recordings.byId', async () => {
    const data = await query(router, 'recordings.byId', 'rec-bio-1')
    expect(data).toMatchObject({ id: 'rec-bio-1', processing: null })
  })

  it('transcripts.byRecording', async () => {
    const data = await query(router, 'transcripts.byRecording', 'rec-bio-1')
    expect(Array.isArray(data)).toBe(true)
    expect((data as unknown[]).length).toBeGreaterThan(0)
  })

  it('tags.list', async () => {
    const data = await query(router, 'tags.list', {})
    expect(Array.isArray(data)).toBe(true)
  })

  it('tags.forTarget', async () => {
    const data = await query(router, 'tags.forTarget', { targetType: 'transcript_segment', targetId: 'seg-bio4-04' })
    expect(Array.isArray(data)).toBe(true)
  })

  it('annotations.list', async () => {
    const data = await query(router, 'annotations.list', {})
    expect(Array.isArray(data)).toBe(true)
  })

  it('confidence.list', async () => {
    const data = await query(router, 'confidence.list', {})
    expect(Array.isArray(data)).toBe(true)
  })

  it('links.connections', async () => {
    const data = await query(router, 'links.connections', { segmentId: 'seg-bio4-04' })
    expect(Array.isArray(data)).toBe(true)
  })

  it('links.byLecture', async () => {
    const data = await query(router, 'links.byLecture', { lectureId: 'lec-rec-bio-1' })
    expect(Array.isArray(data)).toBe(true)
  })

  it('lectures.list and lectures.byId', async () => {
    const all = await query(router, 'lectures.list', {}) as { id: string }[]
    expect(all.map((l) => l.id)).toEqual(['lec-rec-bio-4', 'lec-rec-bio-3', 'lec-rec-chem-1', 'lec-rec-bio-2', 'lec-rec-bio-1'])
    const chem = await query(router, 'lectures.list', { courseTag: 'chemistry' }) as { id: string }[]
    expect(chem.map((l) => l.id)).toEqual(['lec-rec-chem-1'])
    expect(await query(router, 'lectures.byId', 'lec-rec-bio-4')).toMatchObject({
      id: 'lec-rec-bio-4', course: 'biology',
      recordings: [{ id: 'rec-bio-4', title: 'Biology Lecture: Mitochondrial DNA', status: 'ready', processing: null }],
    })
    expect(await query(router, 'lectures.byId', 'lec-missing')).toBeNull()
  })

  it("a recording's course is its lecture's", async () => {
    expect(await query(router, 'recordings.byId', 'rec-chem-1')).toMatchObject({ lecture_id: 'lec-rec-chem-1', course: 'chemistry' })
    const bio = await query(router, 'recordings.list', { courseTag: 'biology' }) as { id: string }[]
    expect(bio.map((r) => r.id)).toEqual(['rec-bio-4', 'rec-bio-3', 'rec-bio-2', 'rec-bio-1'])
    await mutate(router, 'lectures.update', { id: 'lec-rec-chem-1', course: 'physics' })
    expect(await query(router, 'recordings.byId', 'rec-chem-1')).toMatchObject({ course: 'physics' })
  })

  it('aggregates.weeklyOverview', async () => {
    const data = await query(router, 'aggregates.weeklyOverview', {})
    expect(Array.isArray(data)).toBe(true)
  })

  it('aggregates.gapAnalysis', async () => {
    const data = await query(router, 'aggregates.gapAnalysis')
    expect(Array.isArray(data)).toBe(true)
  })

  it('aggregates.weakestTopics', async () => {
    const data = await query(router, 'aggregates.weakestTopics')
    expect(Array.isArray(data)).toBe(true)
  })

  it('workspaces.list', async () => {
    const data = await query(router, 'workspaces.list')
    expect(Array.isArray(data)).toBe(true)
    expect((data as unknown[]).length).toBeGreaterThan(0)
  })

  it('workspaces.panels', async () => {
    const data = await query(router, 'workspaces.panels', 'ws-in-lecture')
    expect(Array.isArray(data)).toBe(true)
  })

  it('workspaces.scopes, ordered by type as on the server', async () => {
    // The course is written before the lecture, so stored order is tag first.
    await mutate(router, 'workspaces.setBoardScope', { workspaceId: 'ws-in-lecture', lectureId: null, courseTag: null })
    await mutate(router, 'workspaces.setBoardScope', { workspaceId: 'ws-in-lecture', courseTag: 'biology' })
    await mutate(router, 'workspaces.setBoardScope', { workspaceId: 'ws-in-lecture', lectureId: 'lec-rec-bio-4' })
    const data = await query(router, 'workspaces.scopes', 'ws-in-lecture') as { scope_type: string }[]
    expect(data.map((s) => s.scope_type)).toEqual(['lecture', 'tag'])
  })

  it('workflows.forLens', async () => {
    const data = await query(router, 'workflows.forLens', { lensType: 'transcript', workspaceId: 'ws-in-lecture' })
    expect(Array.isArray(data)).toBe(true)
  })

  it('workflows.forWorkspace', async () => {
    const data = await query(router, 'workflows.forWorkspace', { workspaceId: 'ws-in-lecture' })
    expect(Array.isArray(data)).toBe(true)
  })

  it('jobs.recent', async () => {
    const data = await query(router, 'jobs.recent')
    expect(Array.isArray(data)).toBe(true)
  })

  it('jobs.runningCount', async () => {
    const data = await query(router, 'jobs.runningCount')
    expect(typeof data).toBe('number')
  })

  it('jobs.forWorkflow', async () => {
    const data = await query(router, 'jobs.forWorkflow', 'wf-audio-transcribe')
    expect(Array.isArray(data)).toBe(true)
  })

  // --- Board course scope (mirrors andInCourse on the server) ---

  it('aggregates filter by course', async () => {
    const overview = await query(router, 'aggregates.weeklyOverview', { courseTag: 'chemistry' }) as { course: string }[]
    expect(overview.map((c) => c.course)).toEqual(['chemistry'])
    const topics = await query(router, 'aggregates.weakestTopics', { courseTag: 'chemistry', limit: 3 }) as { course: string; rank: number }[]
    expect(topics.length).toBeGreaterThan(0)
    expect(topics.every((t) => t.course === 'chemistry')).toBe(true)
    expect(topics[0].rank).toBe(1)
  })

  // Same numbers the server returns on the 002_seed.sql data.
  it('progress, all courses and weak topics agree, as on the server', async () => {
    const progress = await query(router, 'aggregates.weeklyOverview', {})
    expect(progress).toEqual([
      { course: 'biology', totalMoments: 54, solidMoments: 7, reviewMoments: 5, percentage: 13 },
      { course: 'chemistry', totalMoments: 13, solidMoments: 3, reviewMoments: 1, percentage: 23 },
    ])
    expect(await query(router, 'aggregates.gapAnalysis')).toEqual(progress)
    const topics = await query(router, 'aggregates.weakestTopics', {}) as { segmentId: string; label: string; confidence: number | null; confused: boolean }[]
    expect(topics.map((t) => t.segmentId)).toEqual(['seg-bio4-08', 'seg-bio4-04', 'seg-bio4-10', 'seg-bio2-07', 'seg-bio3-07', 'seg-chem1-04'])
    expect(topics[1]).toMatchObject({ label: 'Maternal inheritance', confidence: 25, confused: true })
    expect(topics[3]).toMatchObject({ confidence: 40, confused: false })
  })

  it('tags, confidence and annotations filter by their lecture course', async () => {
    const tags = await query(router, 'tags.list', { courseTag: 'chemistry' }) as { target_id: string }[]
    expect(tags.map((t) => t.target_id).sort()).toEqual(['seg-chem1-04', 'seg-chem1-09'])
    const confidence = await query(router, 'confidence.list', { courseTag: 'chemistry' }) as { target_id: string }[]
    expect(confidence.every((c) => c.target_id.startsWith('seg-chem1-'))).toBe(true)
    const annotations = await query(router, 'annotations.list', { courseTag: 'chemistry' }) as { anchor_id: string }[]
    expect(annotations.map((a) => a.anchor_id)).toEqual(['seg-chem1-04'])
  })

  it('concept links filter by course', async () => {
    expect(await query(router, 'links.connections', { segmentId: 'seg-bio4-04', courseTag: 'chemistry' })).toEqual([])
    const bio = await query(router, 'links.connections', { segmentId: 'seg-bio4-04', courseTag: 'biology' }) as unknown[]
    expect(bio.length).toBeGreaterThan(0)
  })

  it('readers narrow to a lecture, and apply the course with it', async () => {
    const tags = await query(router, 'tags.list', { lectureId: 'lec-rec-chem-1', courseTag: 'chemistry' }) as { target_id: string }[]
    expect(tags.map((t) => t.target_id).sort()).toEqual(['seg-chem1-04', 'seg-chem1-09'])
    const annotations = await query(router, 'annotations.list', { lectureId: 'lec-rec-chem-1' }) as unknown[]
    expect(annotations).toHaveLength(1)
    const confidence = await query(router, 'confidence.list', { lectureId: 'lec-rec-chem-1' }) as unknown[]
    expect(confidence).toHaveLength(4)
    // Both filters apply: a lecture outside the course gives nothing.
    expect(await query(router, 'tags.list', { lectureId: 'lec-rec-chem-1', courseTag: 'biology' })).toEqual([])
    // One recording of it (e.g. a study block's).
    const one = await query(router, 'tags.list', { recordingId: 'rec-chem-1' }) as unknown[]
    expect(one).toHaveLength(2)
  })

  it('the per-dimension setScope is gone', async () => {
    await expect(mutate(router, 'workspaces.setScope', { workspaceId: 'ws-exam-prep', scopeType: 'tag', scopeValue: 'biology' }))
      .rejects.toThrow('No handler')
  })

  it('writes naming a board that is gone are rejected, as on the server', async () => {
    const before = (await query(router, 'workspaces.panels', 'ws-gone') as unknown[]).length
    await expect(mutate(router, 'workspaces.addPanel', { workspaceId: 'ws-gone', lensType: 'calendar', slotName: 'slot-1' }))
      .rejects.toThrow('Board not found')
    await expect(mutate(router, 'workspaces.setBoardScope', { workspaceId: 'ws-gone', courseTag: 'biology' }))
      .rejects.toThrow('Board not found')
    await expect(mutate(router, 'workspaces.updateBackground', { workspaceId: 'ws-gone', backgroundType: 'solid', backgroundValue: '#000' }))
      .rejects.toThrow('Board not found')
    await expect(mutate(router, 'workflows.create', { workspaceId: 'ws-gone', sourceLens: 'transcript', triggerEvent: 'tag:created', jobs: [] }))
      .rejects.toThrow('Board not found')
    const [source] = await query(router, 'workflows.forWorkspace', { workspaceId: 'ws-in-lecture' }) as { id: string }[]
    await expect(mutate(router, 'workflows.createOverride', { sourceWorkflowId: source.id, workspaceId: 'ws-gone', enabled: false }))
      .rejects.toThrow('Board not found')
    const onGone = await query(router, 'workflows.forWorkspace', { workspaceId: 'ws-gone' }) as { workspace_id: string | null }[]
    expect(onGone.filter((w) => w.workspace_id === 'ws-gone')).toEqual([])
    expect(before).toBe(0)
    expect(await query(router, 'workspaces.panels', 'ws-gone')).toEqual([])
    expect(await query(router, 'workspaces.scopes', 'ws-gone')).toEqual([])
  })

  it('setBoardScope keeps the board rules, as on the server', async () => {
    const scope = async (ws: string) =>
      (await query(router, 'workspaces.scopes', ws) as { scope_type: string; scope_value: string }[])
        .map((s) => [s.scope_type, s.scope_value]).sort()
    // An in-course lecture stays; another course clears it.
    expect(await mutate(router, 'workspaces.setBoardScope', { workspaceId: 'ws-evening-review', courseTag: 'biology' }))
      .toEqual({ courseTag: 'biology', lectureId: 'lec-rec-bio-4' })
    await mutate(router, 'workspaces.setBoardScope', { workspaceId: 'ws-evening-review', courseTag: 'chemistry' })
    expect(await scope('ws-evening-review')).toEqual([['tag', 'chemistry']])
    // A lecture brings its course; naming another course with it is refused.
    await mutate(router, 'workspaces.setBoardScope', { workspaceId: 'ws-evening-review', lectureId: 'lec-rec-bio-4' })
    expect(await scope('ws-evening-review')).toEqual([['lecture', 'lec-rec-bio-4'], ['tag', 'biology']])
    await expect(mutate(router, 'workspaces.setBoardScope', { workspaceId: 'ws-evening-review', lectureId: 'lec-rec-chem-1', courseTag: 'biology' }))
      .rejects.toThrow("A selected lecture's course is the board course")
    // "All courses" clears a lecture that has a course.
    await mutate(router, 'workspaces.setBoardScope', { workspaceId: 'ws-evening-review', courseTag: null })
    expect(await scope('ws-evening-review')).toEqual([])
    await expect(mutate(router, 'workspaces.setBoardScope', { workspaceId: 'ws-evening-review', lectureId: 'lec-missing' }))
      .rejects.toThrow('Lecture not found')
  })

  it('lectures.create with a board selects it there; lectures.update re-scopes boards', async () => {
    const lecture = await mutate(router, 'lectures.create', { course: 'physics', title: 'Optics', workspaceId: 'ws-in-lecture' }) as { id: string }
    const scope = async () =>
      (await query(router, 'workspaces.scopes', 'ws-in-lecture') as { scope_type: string; scope_value: string }[])
        .map((s) => [s.scope_type, s.scope_value]).sort()
    expect(await scope()).toEqual([['lecture', lecture.id], ['tag', 'physics']])
    await mutate(router, 'lectures.update', { id: lecture.id, course: 'chemistry' })
    expect(await scope()).toEqual([['lecture', lecture.id], ['tag', 'chemistry']])
  })

  it('planItems.list', async () => {
    const data = await query(router, 'planItems.list', {})
    expect(Array.isArray(data)).toBe(true)
  })

  it('planItems.byId', async () => {
    const data = await query(router, 'planItems.byId', 'missing')
    expect(data).toBeNull()
  })

  // --- Missing procedures (exist in server, not in simulator) ---

  it('workspaces.reorder — NOT_FOUND in simulator (missing procedure)', async () => {
    await expect(query(router, 'workspaces.reorder', { ids: [] })).rejects.toThrow('No handler for procedure')
  })

  it('workspaces.updatePanelConfig — NOT_FOUND in simulator (missing procedure)', async () => {
    await expect(query(router, 'workspaces.updatePanelConfig', { panelId: 'wp-1', configPatch: {} })).rejects.toThrow('No handler for procedure')
  })
})

// Mutations are called straight on the router (the HTTP encoding is covered above).
describe('simulator parity - plan items behave like the server router', () => {
  let router: ProcedureRouter

  beforeEach(() => {
    router = makeRouter()
  })

  async function call(path: string, input: unknown) {
    const result = await router.resolve(path, input)
    if (result.error) throw new Error(result.error.message)
    return result.data as Record<string, unknown>
  }

  it('creates a weekly class with a course and expands it by range', async () => {
    const lecture = await call('planItems.create', {
      kind: 'commitment',
      title: 'Biology lecture',
      starts_at: '2026-10-19T09:00:00.000Z',
      ends_at: '2026-10-19T10:00:00.000Z',
      recurrence: { freq: 'weekly', timeZone: 'Europe/London' },
      course: 'biology',
    })
    expect(lecture).toMatchObject({ course: 'biology', status: 'open' })

    const rows = await query(router, 'planItems.list', { from: '2026-10-19T00:00:00.000Z', to: '2026-11-02T00:00:00.000Z', courseTag: 'biology' }) as { starts_at: string }[]
    expect(rows.map((r) => r.starts_at)).toEqual(['2026-10-19T09:00:00.000Z', '2026-10-26T10:00:00.000Z'])
    expect(await query(router, 'planItems.list', { courseTag: 'chemistry' })).toEqual([])
  })

  it('previews and accepts a re-fit of a missed block, as the server does', async () => {
    const hour = 60 * 60_000
    const now = Date.now()
    const missed = await call('planItems.create', {
      kind: 'task', title: 'Read chapter 5', duration_min: 30,
      starts_at: new Date(now - 26 * hour).toISOString(), ends_at: new Date(now - 25.5 * hour).toISOString(),
    })
    await call('planItems.create', { kind: 'commitment', title: 'Shift', starts_at: new Date(now - 3 * hour).toISOString(), ends_at: new Date(now - 2 * hour).toISOString() })

    const preview = await call('planItems.refitPreview', { timeZone: 'Europe/London' }) as unknown as { item: { id: string }; starts_at: string; ends_at: string }[]
    expect(preview.map((p) => p.item.id)).toEqual([missed.id])
    const block = { id: missed.id, starts_at: preview[0].starts_at, ends_at: preview[0].ends_at }
    expect(Date.parse(block.starts_at)).toBeGreaterThanOrEqual(now)

    expect(await call('planItems.refit', { timeZone: 'Europe/London', blocks: [block] })).toEqual({ moved: 1 })
    expect(await call('planItems.refitPreview', { timeZone: 'Europe/London' })).toEqual([])
    await expect(call('planItems.refit', { timeZone: 'Europe/London', blocks: [block] })).rejects.toThrow(/already moved/)
  })

  it('updates, completes, dismisses and deletes, keeping course in tags', async () => {
    const todo = await call('planItems.create', { kind: 'task', title: 'Review', duration_min: 20, course: 'biology' })
    const id = todo.id as string

    expect(await call('planItems.update', { id, patch: { course: 'chemistry', title: 'Review notes' } }))
      .toMatchObject({ course: 'chemistry', title: 'Review notes', duration_min: 20 })
    expect(await call('planItems.complete', id)).toMatchObject({ status: 'done' })
    expect(await call('planItems.dismiss', id)).toMatchObject({ status: 'dismissed' })

    await call('planItems.delete', id)
    expect(await query(router, 'planItems.byId', id)).toBeNull()
    await expect(call('planItems.delete', id)).rejects.toThrow(/not found/)
    const tags = await query(router, 'tags.forTarget', { targetType: 'plan_item', targetId: id })
    expect(tags).toEqual([])
  })

  it('rejects the same invalid shapes as the server', async () => {
    await expect(call('planItems.create', { kind: 'commitment', title: 'No time' })).rejects.toThrow(/commitment/)
    await expect(call('planItems.create', { kind: 'deadline', title: 'No due' })).rejects.toThrow(/due_at/)
    await expect(call('planItems.complete', 'missing')).rejects.toThrow(/not found/)
    const span = { starts_at: '2026-10-19T09:00:00.000Z', ends_at: '2026-10-19T10:00:00.000Z' }
    await expect(call('planItems.create', { kind: 'task', title: 'Weekly', ...span, recurrence: { freq: 'weekly' } })).rejects.toThrow(/only commitments/)
    await expect(call('planItems.create', { kind: 'deadline', title: 'Date only', due_at: '2026-10-22' })).rejects.toThrow()
    await expect(query(router, 'planItems.list', { from: '2026-10-19T00:00:00.000Z' })).rejects.toThrow(/together/)
  })

  it('normalises timestamps to Z and ignores unknown or derived keys on update', async () => {
    const lecture = await call('planItems.create', {
      kind: 'commitment', title: 'Lecture', starts_at: '2026-10-19T10:00:00+01:00', ends_at: '2026-10-19T11:00:00+01:00',
      recurrence: { freq: 'weekly' },
    })
    expect(lecture.starts_at).toBe('2026-10-19T09:00:00.000Z')

    const [, row] = await query(router, 'planItems.list', { from: '2026-10-19T00:00:00.000Z', to: '2026-11-02T00:00:00.000Z' }) as Record<string, unknown>[]
    expect(row).toMatchObject({ starts_at: '2026-10-26T09:00:00.000Z', series_starts_at: '2026-10-19T09:00:00.000Z' })

    const updated = await call('planItems.update', {
      id: lecture.id, patch: { title: 'Lecture 2', occurrence_key: 'junk', series_starts_at: 'junk', bogus: 1 },
    })
    expect(updated).toMatchObject({ title: 'Lecture 2', starts_at: '2026-10-19T09:00:00.000Z' })
    expect(updated).not.toHaveProperty('occurrence_key')
    expect(updated).not.toHaveProperty('bogus')
  })

  it('filters by scheduled', async () => {
    await call('planItems.create', { kind: 'task', title: 'Placed', starts_at: '2026-10-28T18:00:00.000Z', ends_at: '2026-10-28T18:20:00.000Z' })
    await call('planItems.create', { kind: 'task', title: 'Loose' })
    const titles = async (scheduled: boolean) =>
      (await query(router, 'planItems.list', { scheduled }) as { title: string }[]).map((r) => r.title)
    expect(await titles(true)).toEqual(['Placed'])
    expect(await titles(false)).toEqual(['Loose'])
  })
})

describe('simulator parity - preferences', () => {
  let router: ProcedureRouter

  beforeEach(() => {
    router = makeRouter()
  })

  it('reads the defaults until set, updates only the given fields, and null resets one', async () => {
    const every = { start: '09:00', end: '22:00' }
    const defaultHours = { mon: every, tue: every, wed: every, thu: every, fri: every, sat: every, sun: every }
    expect(await query(router, 'preferences.get')).toEqual({ time_zone: null, study_hours: defaultHours, study_min_per_day: 120 })

    const hours = { ...defaultHours, mon: { start: '10:00', end: '22:00' }, sun: null }
    await mutate(router, 'preferences.update', { study_hours: hours, study_min_per_day: 90 })
    expect(await query(router, 'preferences.get')).toEqual({ time_zone: null, study_hours: hours, study_min_per_day: 90 })

    await mutate(router, 'preferences.update', { study_min_per_day: null })
    expect(await query(router, 'preferences.get')).toEqual({ time_zone: null, study_hours: hours, study_min_per_day: 120 })
    await expect(mutate(router, 'preferences.update', { study_hours: { ...hours, tue: { start: '9', end: '22:00' } } })).rejects.toThrow()
  })
})

describe('simulator parity - which automation made a plan item', () => {
  let db: InMemoryDb
  let router: ProcedureRouter

  beforeEach(() => {
    db = new InMemoryDb(createDefaultSeedData())
    router = new ProcedureRouter()
    registerWorkflowsHandlers(router, db)
    registerPlanItemsHandlers(router, db)
  })

  async function call(path: string, input: unknown) {
    const result = await router.resolve(path, input)
    if (result.error) throw new Error(result.error.message)
    return result.data as Record<string, unknown>
  }

  it('never takes it from a client, on create or update', async () => {
    const created = await call('planItems.create', { kind: 'task', title: 'Review', created_by_workflow_id: 'wf-confused-review' })
    expect(created.created_by_workflow_id).toBeNull()
    const updated = await call('planItems.update', { id: created.id, patch: { title: 'Review it', created_by_workflow_id: 'wf-confused-review' } })
    expect(updated).toMatchObject({ title: 'Review it', created_by_workflow_id: null })
  })

  it('forgets it when the automation is deleted, and keeps the item', async () => {
    const created = await call('planItems.create', { kind: 'task', title: 'Review' })
    db.planItems.find((p) => p.id === created.id)!.created_by_workflow_id = 'wf-confused-review'
    expect(await call('workflows.byId', 'wf-confused-review')).toMatchObject({ id: 'wf-confused-review' })

    await call('workflows.delete', { workflowId: 'wf-confused-review' })
    expect(await call('workflows.byId', 'wf-confused-review')).toBeNull()
    expect(await call('planItems.byId', created.id)).toMatchObject({ title: 'Review', created_by_workflow_id: null })
  })
})

describe('simulator parity - class lectures (Record during a class, calendar class clicks)', () => {
  let router: ProcedureRouter

  beforeEach(() => {
    router = makeRouter()
  })

  async function call(path: string, input: unknown) {
    const result = await router.resolve(path, input)
    if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code })
    return result.data as Record<string, any>
  }

  const scope = async (workspaceId: string) =>
    ((await router.resolve('workspaces.scopes', workspaceId)).data as { scope_type: string; scope_value: string }[])
      .map((s) => [s.scope_type, s.scope_value]).sort()

  /** Mondays 10:00-12:00 London from Mon 19 Oct 2026, as the server's db test. */
  const bioClass = () => call('planItems.create', {
    kind: 'commitment', title: 'Biology lecture', subtype: 'class', course: 'biology',
    starts_at: '2026-10-19T09:00:00.000Z', ends_at: '2026-10-19T11:00:00.000Z',
    recurrence: { freq: 'weekly', timeZone: 'Europe/London' },
  })

  it('forClassOccurrence finds or makes one lecture per occurrence and selects it on the board', async () => {
    const { id } = await bioClass()
    const first = await call('lectures.forClassOccurrence', { planItemId: id, date: '2026-10-26', workspaceId: 'ws-in-lecture' })
    expect(first.created).toBe(true)
    expect(first.lecture).toMatchObject({
      title: 'Biology lecture · Mon 26 Oct', course: 'biology', class_item_id: id, class_date: '2026-10-26',
      starts_at: '2026-10-26T10:00:00.000Z',
    })
    expect(first.board.after).toEqual({ courseTag: 'biology', lectureId: first.lecture.id })
    expect(await scope('ws-in-lecture')).toEqual([['lecture', first.lecture.id], ['tag', 'biology']])
    const again = await call('lectures.forClassOccurrence', { planItemId: id, date: '2026-10-26' })
    expect(again).toMatchObject({ created: false, lecture: { id: first.lecture.id }, board: null })
  })

  it('forClassOccurrence refuses a missing class, a date it is not on, and a shift', async () => {
    const { id } = await bioClass()
    const shift = await call('planItems.create', {
      kind: 'commitment', title: 'Cafe shift', subtype: 'shift',
      starts_at: '2026-10-19T17:00:00.000Z', ends_at: '2026-10-19T21:00:00.000Z',
    })
    await expect(call('lectures.forClassOccurrence', { planItemId: 'missing', date: '2026-10-26' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(call('lectures.forClassOccurrence', { planItemId: id, date: '2026-10-27' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(call('lectures.forClassOccurrence', { planItemId: shift.id, date: '2026-10-19' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('lectures.create with matchClass joins the class on now, and the calendar click finds the same lecture', async () => {
    const { id } = await bioClass()
    const during = await call('lectures.create', { course: 'biology', matchClass: true, startsAt: '2026-11-16T09:46:00.000Z', workspaceId: 'ws-in-lecture' })
    expect(during).toMatchObject({ class_item_id: id, class_date: '2026-11-16', title: 'Biology lecture · Mon 16 Nov' })
    expect(await scope('ws-in-lecture')).toEqual([['lecture', during.id], ['tag', 'biology']])
    const clicked = await call('lectures.forClassOccurrence', { planItemId: id, date: '2026-11-16' })
    expect(clicked.lecture.id).toBe(during.id)
    const after = await call('lectures.create', { course: 'biology', matchClass: true, startsAt: '2026-11-16T12:01:00.000Z' })
    expect(after.class_item_id).toBeNull()
    const otherCourse = await call('lectures.create', { course: 'physics', matchClass: true, startsAt: '2026-11-16T10:30:00.000Z' })
    expect(otherCourse.class_item_id).toBeNull()
  })

  it('a one-off class keeps the zone it was made in, and is dated in it whatever zone asks later', async () => {
    // Tue 3 Nov, 22:00 in New York: Wed 4 Nov in London.
    const made = await call('planItems.create', {
      kind: 'commitment', title: 'Night seminar', subtype: 'class', course: 'physics',
      starts_at: '2026-11-04T03:00:00.000Z', ends_at: '2026-11-04T04:00:00.000Z', timeZone: 'America/New_York',
    })
    expect(made.time_zone).toBe('America/New_York')
    const clicked = await call('lectures.forClassOccurrence', { planItemId: made.id, date: '2026-11-03', timeZone: 'Europe/London' })
    expect(clicked.lecture).toMatchObject({ class_date: '2026-11-03', title: 'Night seminar · Tue 3 Nov' })
    const during = await call('lectures.create', { course: 'physics', matchClass: true, startsAt: '2026-11-04T03:30:00.000Z', timeZone: 'Asia/Tokyo' })
    expect(during.id).toBe(clicked.lecture.id)
    const edited = await call('planItems.update', { id: made.id, patch: { title: 'Night seminar (new room)' }, timeZone: 'Europe/London' })
    expect(edited.time_zone).toBe('America/New_York')
  })

  it('deleting a class keeps its lectures, on their day', async () => {
    const { id } = await bioClass()
    const { lecture } = await call('lectures.forClassOccurrence', { planItemId: id, date: '2026-10-26' })
    await call('planItems.delete', id)
    expect(await call('lectures.byId', lecture.id)).toMatchObject({ class_item_id: null, class_date: '2026-10-26' })
  })
})
