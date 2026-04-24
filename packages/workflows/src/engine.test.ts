import { describe, it, expect, vi } from 'vitest'
import { createWorkflowEngine } from './engine'
import { createExecutorRegistry } from './executor-registry'
import type { WorkflowStore, WorkflowWithJobs, JobRun } from './types'

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

function makeStore(overrides: Partial<WorkflowStore> = {}): WorkflowStore {
  return {
    getEffectiveWorkflows: vi.fn(() => [] as WorkflowWithJobs[]),
    getPendingJobRuns: vi.fn(() => [] as JobRun[]),
    enqueueJobRun: vi.fn((_wfId, wjId) => `run-${wjId}`),
    updateJobRunStatus: vi.fn(),
    ...overrides,
  }
}

describe('workflow engine', () => {
  describe('matchesCondition', () => {
    it('returns true when the workflow has no condition fields', () => {
      const store = makeStore()
      const engine = createWorkflowEngine({ store, executors: createExecutorRegistry() })
      const wf = makeWorkflow({ condition_field: null, condition_value: null })
      expect(engine.matchesCondition(wf, { foo: 'bar' })).toBe(true)
    })

    it('returns true when condition matches payload', () => {
      const store = makeStore()
      const engine = createWorkflowEngine({ store, executors: createExecutorRegistry() })
      const wf = makeWorkflow({ condition_field: 'kind', condition_value: 'lecture' })
      expect(engine.matchesCondition(wf, { kind: 'lecture' })).toBe(true)
    })

    it("returns false when condition doesn't match", () => {
      const store = makeStore()
      const engine = createWorkflowEngine({ store, executors: createExecutorRegistry() })
      const wf = makeWorkflow({ condition_field: 'kind', condition_value: 'lecture' })
      expect(engine.matchesCondition(wf, { kind: 'seminar' })).toBe(false)
    })
  })

  describe('dispatch', () => {
    it('calls store.getEffectiveWorkflows with the correct event + scope', () => {
      const store = makeStore()
      const engine = createWorkflowEngine({ store, executors: createExecutorRegistry() })
      engine.dispatch('evt:test', {}, 'ws-1')
      expect(store.getEffectiveWorkflows).toHaveBeenCalledWith('evt:test', 'ws-1')
    })

    it('enqueues job runs for matching workflows', () => {
      const wf = makeWorkflow()
      const store = makeStore({
        getEffectiveWorkflows: vi.fn(() => [wf]),
      })
      const engine = createWorkflowEngine({ store, executors: createExecutorRegistry() })
      const result = engine.dispatch('evt:test', { foo: 'bar' }, null)
      expect(store.enqueueJobRun).toHaveBeenCalledTimes(1)
      expect(store.enqueueJobRun).toHaveBeenCalledWith(
        'wf-1',
        'wj-1',
        'test:run',
        expect.objectContaining({ foo: 'bar' }),
        1,
      )
      expect(result.enqueuedJobIds).toEqual(['run-wj-1'])
    })

    it("skips workflows that don't match condition", () => {
      const wf = makeWorkflow({ condition_field: 'kind', condition_value: 'match' })
      const store = makeStore({ getEffectiveWorkflows: vi.fn(() => [wf]) })
      const engine = createWorkflowEngine({ store, executors: createExecutorRegistry() })
      const result = engine.dispatch('evt:test', { kind: 'other' }, null)
      expect(store.enqueueJobRun).not.toHaveBeenCalled()
      expect(result.enqueuedJobIds).toEqual([])
    })

    it('returns empty when depth >= maxDepth', () => {
      const wf = makeWorkflow()
      const store = makeStore({ getEffectiveWorkflows: vi.fn(() => [wf]) })
      const engine = createWorkflowEngine({ store, executors: createExecutorRegistry(), maxDepth: 3 })
      const result = engine.dispatch('evt:test', {}, null, 3)
      expect(store.getEffectiveWorkflows).not.toHaveBeenCalled()
      expect(store.enqueueJobRun).not.toHaveBeenCalled()
      expect(result.enqueuedJobIds).toEqual([])
    })

    it('returns enqueued job IDs', () => {
      const wf = makeWorkflow({
        jobs: [
          { id: 'wj-a', workflow_id: 'wf-1', job_type: 't', params: {}, sort_order: 0, delay_ms: 0 },
          { id: 'wj-b', workflow_id: 'wf-1', job_type: 't', params: {}, sort_order: 1, delay_ms: 0 },
        ],
      })
      const store = makeStore({ getEffectiveWorkflows: vi.fn(() => [wf]) })
      const engine = createWorkflowEngine({ store, executors: createExecutorRegistry() })
      const result = engine.dispatch('evt:test', {}, null)
      expect(result.enqueuedJobIds).toEqual(['run-wj-a', 'run-wj-b'])
    })
  })
})
