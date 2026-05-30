import { describe, it, expect, vi, beforeEach } from 'vitest'

// The adapter is a thin mapping/threading layer over `queries/workflows` + the
// sql.js `db` module. sql.js boots from a browser wasm path, so rather than
// stand up a real DB we mock those dependencies and assert the mapping the
// adapter itself owns: JSON (de)serialization, the enabled number->boolean and
// params->object coercions, the retry_count=0 default, arg threading, the
// (jobType, target_id) dedup, and commit -> persistDb.
vi.mock('../queries/workflows', () => ({
  getEffectiveWorkflows: vi.fn(),
  enqueueJobRun: vi.fn(),
  getPendingJobRuns: vi.fn(),
  updateJobRunStatus: vi.fn(),
}))
vi.mock('../db', () => ({ persistDb: vi.fn() }))

import {
  getEffectiveWorkflows,
  enqueueJobRun,
  getPendingJobRuns,
  updateJobRunStatus,
} from '../queries/workflows'
import { persistDb } from '../db'
import type { JobRun as SubstrateJobRun } from '../types'
import { createSqlJsAdapter } from './sql-js-adapter'

const adapter = createSqlJsAdapter()

beforeEach(() => {
  vi.clearAllMocks()
})

function substrateRun(overrides: Partial<SubstrateJobRun> = {}): SubstrateJobRun {
  return {
    id: 'r1',
    workflow_id: 'w1',
    workflow_job_id: 'j1',
    job_type: 'ai:transcribe',
    status: 'pending',
    input: '{"target_id":"rec-1"}',
    output: null,
    error: null,
    depth: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    started_at: null,
    completed_at: null,
    ...overrides,
  }
}

describe('createSqlJsAdapter — getEffectiveWorkflows', () => {
  it('coerces enabled->boolean, decodes params JSON, and maps jobs to the core shape', async () => {
    vi.mocked(getEffectiveWorkflows).mockReturnValue([
      {
        id: 'w1',
        source_lens: 'transcript',
        trigger_event: 'recording:completed',
        condition_field: null,
        condition_value: null,
        enabled: 1,
        workspace_id: null,
        created_at: '2026-01-01T00:00:00.000Z',
        jobs: [
          {
            id: 'j1',
            workflow_id: 'w1',
            job_type: 'ai:transcribe',
            params: '{"model":"best"}',
            sort_order: 0,
            delay_ms: 0,
          },
        ],
      },
    ])

    const result = await adapter.getEffectiveWorkflows('recording:completed', 'ws-1')

    expect(getEffectiveWorkflows).toHaveBeenCalledWith('recording:completed', 'ws-1')
    expect(result).toEqual([
      {
        id: 'w1',
        source_lens: 'transcript',
        trigger_event: 'recording:completed',
        condition_field: null,
        condition_value: null,
        enabled: true,
        jobs: [
          {
            id: 'j1',
            workflow_id: 'w1',
            job_type: 'ai:transcribe',
            params: { model: 'best' },
            sort_order: 0,
            delay_ms: 0,
          },
        ],
      },
    ])
  })

  it('defaults missing params to {} and maps enabled 0 -> false', async () => {
    vi.mocked(getEffectiveWorkflows).mockReturnValue([
      {
        id: 'w2',
        source_lens: 'transcript',
        trigger_event: 'tag:created',
        condition_field: 'kind',
        condition_value: 'topic',
        enabled: 0,
        workspace_id: 'ws-1',
        created_at: '2026-01-01T00:00:00.000Z',
        jobs: [
          { id: 'j2', workflow_id: 'w2', job_type: 'schedule:quiz', params: '', sort_order: 1, delay_ms: 500 },
        ],
      },
    ])

    const [wf] = await adapter.getEffectiveWorkflows('tag:created', 'ws-1')

    expect(wf.enabled).toBe(false)
    expect(wf.jobs[0].params).toEqual({})
  })
})

describe('createSqlJsAdapter — job run lifecycle', () => {
  it('threads enqueue args through (and drops retryCount, which substrate has no column for)', async () => {
    vi.mocked(enqueueJobRun).mockReturnValue('generated-id')

    const id = await adapter.enqueueJobRun({
      workflowId: 'w1',
      workflowJobId: 'j1',
      jobType: 'ai:transcribe',
      input: { target_id: 'rec-1', _delayMs: 0 },
      depth: 2,
      retryCount: 5,
    })

    expect(id).toBe('generated-id')
    expect(enqueueJobRun).toHaveBeenCalledWith(
      'w1',
      'j1',
      'ai:transcribe',
      { target_id: 'rec-1', _delayMs: 0 },
      2,
    )
    // retryCount must not be forwarded as a 6th positional arg.
    expect(vi.mocked(enqueueJobRun).mock.calls[0]).toHaveLength(5)
  })

  it('claimPendingJobRuns decodes input/output JSON and supplies retry_count=0', async () => {
    vi.mocked(getPendingJobRuns).mockReturnValue([
      substrateRun({ input: '{"target_id":"rec-1"}', output: '{"ok":true}', status: 'pending' }),
      substrateRun({ id: 'r2', input: null, output: null }),
    ])

    const runs = await adapter.claimPendingJobRuns()

    expect(runs[0]).toMatchObject({
      id: 'r1',
      input: { target_id: 'rec-1' },
      output: { ok: true },
      retry_count: 0,
      depth: 1,
    })
    expect(runs[1]).toMatchObject({ id: 'r2', input: null, output: null, retry_count: 0 })
  })

  it('updateJobRunStatus serializes output for completed and omits it for running', () => {
    adapter.updateJobRunStatus('r1', 'completed', { segments: 3 })
    expect(updateJobRunStatus).toHaveBeenCalledWith('r1', 'completed', '{"segments":3}', undefined)

    vi.clearAllMocks()
    adapter.updateJobRunStatus('r1', 'running')
    expect(updateJobRunStatus).toHaveBeenCalledWith('r1', 'running', undefined, undefined)

    vi.clearAllMocks()
    adapter.updateJobRunStatus('r1', 'failed', undefined, 'boom')
    expect(updateJobRunStatus).toHaveBeenCalledWith('r1', 'failed', undefined, 'boom')
  })
})

describe('createSqlJsAdapter — isDuplicate', () => {
  it('returns true when a pending run already targets the same (jobType, target_id)', async () => {
    vi.mocked(getPendingJobRuns).mockReturnValue([
      substrateRun({ job_type: 'ai:transcribe', input: '{"target_id":"rec-1"}' }),
    ])
    expect(await adapter.isDuplicate!('ai:transcribe', { target_id: 'rec-1' })).toBe(true)
  })

  it('returns false when target_id differs or job_type differs', async () => {
    vi.mocked(getPendingJobRuns).mockReturnValue([
      substrateRun({ job_type: 'ai:transcribe', input: '{"target_id":"rec-1"}' }),
    ])
    expect(await adapter.isDuplicate!('ai:transcribe', { target_id: 'rec-2' })).toBe(false)
    expect(await adapter.isDuplicate!('schedule:quiz', { target_id: 'rec-1' })).toBe(false)
  })
})

describe('createSqlJsAdapter — commit', () => {
  it('flushes via persistDb', async () => {
    await adapter.commit!()
    expect(persistDb).toHaveBeenCalledTimes(1)
  })
})
