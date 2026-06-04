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
 *   - aggregates.weakestTopics: server uses COALESCE(avg_score, 100) so untagged
 *     segments sort last; simulator drops untagged segments entirely and
 *     defaults missing confidence to 0 — so ordering diverges.
 *   - aggregates.weeklyOverview: server counts 'confused' tags joined through
 *     course segments; simulator counts all 'confused' tags unconditionally.
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
  return item?.result?.data?.json ?? item?.result?.data
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
    const data = await query(router, 'links.connections', 'seg-bio4-04')
    expect(Array.isArray(data)).toBe(true)
  })

  it('links.byRecording', async () => {
    const data = await query(router, 'links.byRecording', 'rec-bio-1')
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

  // --- Missing procedures (exist in server, not in simulator) ---

  it('workspaces.reorder — NOT_FOUND in simulator (missing procedure)', async () => {
    await expect(query(router, 'workspaces.reorder', { ids: [] })).rejects.toThrow('No handler for procedure')
  })

  it('workspaces.updatePanelConfig — NOT_FOUND in simulator (missing procedure)', async () => {
    await expect(query(router, 'workspaces.updatePanelConfig', { panelId: 'wp-1', configPatch: {} })).rejects.toThrow('No handler for procedure')
  })
})
