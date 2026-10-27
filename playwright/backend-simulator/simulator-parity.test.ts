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
import { registerTranscriptsHandlers } from './handlers/transcripts'
import { registerTagsHandlers } from './handlers/tags'
import { registerJobsHandlers } from './handlers/jobs'
import { registerAnnotationsHandlers } from './handlers/annotations'
import { registerConfidenceHandlers } from './handlers/confidence'
import { registerLinksHandlers } from './handlers/links'
import { registerAggregatesHandlers } from './handlers/aggregates'
import { registerWorkflowsHandlers } from './handlers/workflows'
import { registerPlanItemsHandlers } from './handlers/plan-items'

const BASE_URL = 'http://localhost:3999/trpc'

function makeRouter(): ProcedureRouter {
  const db = new InMemoryDb(createDefaultSeedData())
  const router = new ProcedureRouter()
  registerWorkspacesHandlers(router, db)
  registerRecordingsHandlers(router, db)
  registerTranscriptsHandlers(router, db)
  registerTagsHandlers(router, db)
  registerJobsHandlers(router, db)
  registerAnnotationsHandlers(router, db)
  registerConfidenceHandlers(router, db)
  registerLinksHandlers(router, db)
  registerAggregatesHandlers(router, db)
  registerWorkflowsHandlers(router, db)
  registerPlanItemsHandlers(router, db)
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

async function mutate(router: ProcedureRouter, path: string, input: unknown): Promise<void> {
  const body = JSON.stringify({ '0': { json: input } })
  const result = await handleTrpcRequest(`${BASE_URL}/${path}?batch=1`, 'POST', body, router)
  const parsed = JSON.parse(result.body)
  const item = Array.isArray(parsed) ? parsed[0] : parsed
  if (item?.error) throw new Error(`${path}: ${item.error.message ?? JSON.stringify(item.error)}`)
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
    expect(data).toMatchObject({ id: 'rec-bio-1' })
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

  it('links.byRecording', async () => {
    const data = await query(router, 'links.byRecording', { recordingId: 'rec-bio-1' })
    expect(Array.isArray(data)).toBe(true)
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

  it('workspaces.scopes', async () => {
    const data = await query(router, 'workspaces.scopes', 'ws-in-lecture')
    expect(Array.isArray(data)).toBe(true)
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
    expect(tags.map((t) => t.target_id).sort()).toEqual(['rec-chem-1', 'seg-chem1-04', 'seg-chem1-09'])
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

  it('a targeted lecture wins over the course', async () => {
    // Chemistry lecture focused on a Biology board: its own data still shows.
    const tags = await query(router, 'tags.list', { recordingId: 'rec-chem-1', courseTag: 'biology' }) as { target_id: string }[]
    expect(tags.map((t) => t.target_id).sort()).toEqual(['seg-chem1-04', 'seg-chem1-09'])
    const annotations = await query(router, 'annotations.list', { recordingId: 'rec-chem-1', courseTag: 'biology' }) as unknown[]
    expect(annotations).toHaveLength(1)
    const confidence = await query(router, 'confidence.list', { recordingId: 'rec-chem-1', courseTag: 'biology' }) as unknown[]
    expect(confidence).toHaveLength(4)
  })

  it('setScope rejects unknown scope types', async () => {
    await expect(mutate(router, 'workspaces.setScope', { workspaceId: 'ws-exam-prep', scopeType: 'timeframe', scopeValue: 'week' }))
      .rejects.toThrow()
  })

  it('setScope keeps an in-course focus and clears an orphaned one', async () => {
    const scopes = async () =>
      (await query(router, 'workspaces.scopes', 'ws-evening-review') as { scope_type: string }[]).map((s) => s.scope_type).sort()
    await mutate(router, 'workspaces.setScope', { workspaceId: 'ws-evening-review', scopeType: 'tag', scopeValue: 'biology' })
    expect(await scopes()).toEqual(['recording', 'tag'])
    await mutate(router, 'workspaces.setScope', { workspaceId: 'ws-evening-review', scopeType: 'tag', scopeValue: 'chemistry' })
    expect(await scopes()).toEqual(['tag'])
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
