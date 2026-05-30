import { describe, it, expect, vi } from 'vitest'
import { createWorkflowEngine } from './engine'
import { createMemoryAdapter } from './testing/memory-adapter'
import type { StorageAdapter, WorkflowWithJobs } from './types'

function makeWorkflow(overrides: Partial<WorkflowWithJobs> = {}): WorkflowWithJobs {
  return {
    id: 'wf-1',
    source_lens: 'lens:test',
    trigger_event: 'evt:test',
    condition_field: null,
    condition_value: null,
    enabled: true,
    jobs: [
      {
        id: 'wj-1',
        workflow_id: 'wf-1',
        job_type: 'test:run',
        params: {},
        sort_order: 0,
        delay_ms: 0,
      },
    ],
    ...overrides,
  }
}

describe('workflow engine', () => {
  describe('matchesCondition', () => {
    it('returns true when the workflow has no condition fields', () => {
      const engine = createWorkflowEngine({ adapter: createMemoryAdapter() })
      const wf = makeWorkflow({ condition_field: null, condition_value: null })
      expect(engine.matchesCondition(wf, { foo: 'bar' })).toBe(true)
    })

    it('returns true when condition matches payload', () => {
      const engine = createWorkflowEngine({ adapter: createMemoryAdapter() })
      const wf = makeWorkflow({ condition_field: 'kind', condition_value: 'lecture' })
      expect(engine.matchesCondition(wf, { kind: 'lecture' })).toBe(true)
    })

    it("returns false when condition doesn't match", () => {
      const engine = createWorkflowEngine({ adapter: createMemoryAdapter() })
      const wf = makeWorkflow({ condition_field: 'kind', condition_value: 'lecture' })
      expect(engine.matchesCondition(wf, { kind: 'seminar' })).toBe(false)
    })
  })

  describe('dispatch', () => {
    it('calls adapter.getEffectiveWorkflows with the correct event + scope', async () => {
      const adapter = createMemoryAdapter()
      const spy = vi.spyOn(adapter, 'getEffectiveWorkflows')
      const engine = createWorkflowEngine({ adapter })
      await engine.dispatch({ type: 'evt:test', payload: {} }, { scopeId: 'ws-1' })
      expect(spy).toHaveBeenCalledWith('evt:test', 'ws-1')
    })

    it('enqueues job runs for matching workflows at depth+1', async () => {
      const adapter = createMemoryAdapter({ workflows: [makeWorkflow()] })
      const engine = createWorkflowEngine({ adapter })
      const result = await engine.dispatch(
        { type: 'evt:test', payload: { foo: 'bar' } },
        { scopeId: null },
      )
      expect(result.enqueuedJobIds).toHaveLength(1)
      const run = adapter.jobRuns[0]
      expect(run.job_type).toBe('test:run')
      expect(run.depth).toBe(1)
      expect(run.input).toMatchObject({ foo: 'bar' })
    })

    it("skips workflows that don't match condition", async () => {
      const wf = makeWorkflow({ condition_field: 'kind', condition_value: 'match' })
      const adapter = createMemoryAdapter({ workflows: [wf] })
      const engine = createWorkflowEngine({ adapter })
      const result = await engine.dispatch(
        { type: 'evt:test', payload: { kind: 'other' } },
        { scopeId: null },
      )
      expect(result.enqueuedJobIds).toEqual([])
      expect(adapter.jobRuns).toHaveLength(0)
    })

    it('returns empty when depth >= maxDepth (cycle guard)', async () => {
      const adapter = createMemoryAdapter({ workflows: [makeWorkflow()] })
      const spy = vi.spyOn(adapter, 'getEffectiveWorkflows')
      const engine = createWorkflowEngine({ adapter, maxDepth: 3 })
      const result = await engine.dispatch(
        { type: 'evt:test', payload: {} },
        { scopeId: null, depth: 3 },
      )
      expect(spy).not.toHaveBeenCalled()
      expect(result.enqueuedJobIds).toEqual([])
    })

    it('returns enqueued job IDs for each job in sort order', async () => {
      const wf = makeWorkflow({
        jobs: [
          { id: 'wj-a', workflow_id: 'wf-1', job_type: 't', params: {}, sort_order: 0, delay_ms: 0 },
          { id: 'wj-b', workflow_id: 'wf-1', job_type: 't', params: {}, sort_order: 1, delay_ms: 0 },
        ],
      })
      const adapter = createMemoryAdapter({ workflows: [wf] })
      const engine = createWorkflowEngine({ adapter })
      const result = await engine.dispatch(
        { type: 'evt:test', payload: {} },
        { scopeId: null },
      )
      expect(result.enqueuedJobIds).toHaveLength(2)
      expect(adapter.jobRuns.map((r) => r.workflow_job_id)).toEqual(['wj-a', 'wj-b'])
    })

    it('skips a job when the optional isDuplicate hook returns true', async () => {
      const wf = makeWorkflow()
      const base = createMemoryAdapter({ workflows: [wf] })
      const adapter: StorageAdapter = {
        ...base,
        isDuplicate: vi.fn(() => true),
      }
      const engine = createWorkflowEngine({ adapter })
      const result = await engine.dispatch(
        { type: 'evt:test', payload: {} },
        { scopeId: null },
      )
      expect(adapter.isDuplicate).toHaveBeenCalledWith(
        'test:run',
        expect.objectContaining({ _delayMs: 0 }),
      )
      expect(result.enqueuedJobIds).toEqual([])
    })

    it('calls optional commit() after enqueuing', async () => {
      const wf = makeWorkflow()
      const base = createMemoryAdapter({ workflows: [wf] })
      const commit = vi.fn()
      const adapter: StorageAdapter = { ...base, commit }
      const engine = createWorkflowEngine({ adapter })
      await engine.dispatch({ type: 'evt:test', payload: {} }, { scopeId: null })
      expect(commit).toHaveBeenCalledTimes(1)
    })

    it('injects _delayMs into job input', async () => {
      const wf = makeWorkflow({
        jobs: [
          { id: 'wj-1', workflow_id: 'wf-1', job_type: 't', params: {}, sort_order: 0, delay_ms: 500 },
        ],
      })
      const adapter = createMemoryAdapter({ workflows: [wf] })
      const engine = createWorkflowEngine({ adapter })
      await engine.dispatch({ type: 'evt:test', payload: {} }, { scopeId: null })
      expect(adapter.jobRuns[0].input).toMatchObject({ _delayMs: 500 })
    })
  })
})
