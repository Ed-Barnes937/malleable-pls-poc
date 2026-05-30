import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createJobRunner } from './job-runner'
import { createExecutorRegistry } from './executor-registry'
import { createWorkflowEngine } from './engine'
import { createMemoryAdapter } from './testing/memory-adapter'
import type { JobRun, RunnerEvent, StorageAdapter } from './types'

function makePendingJob(overrides: Partial<JobRun> = {}): JobRun {
  return {
    id: 'run-1',
    workflow_id: 'wf-1',
    workflow_job_id: 'wj-1',
    job_type: 'test:run',
    status: 'pending',
    input: { target_id: 't1' },
    output: null,
    error: null,
    depth: 0,
    retry_count: 0,
    created_at: '2026-04-24T00:00:00.000Z',
    started_at: null,
    completed_at: null,
    ...overrides,
  }
}

/**
 * A controllable adapter: `claimPendingJobRuns` returns a queued batch once,
 * then empty. All other methods are vi.fn spies. Lets us assert the runner's
 * call sequence precisely without a full store.
 */
function makeAdapter(batch: JobRun[]): StorageAdapter & {
  claimPendingJobRuns: ReturnType<typeof vi.fn>
  updateJobRunStatus: ReturnType<typeof vi.fn>
  enqueueJobRun: ReturnType<typeof vi.fn>
} {
  const claim = vi.fn<() => JobRun[]>()
  claim.mockReturnValueOnce(batch).mockReturnValue([])
  return {
    getEffectiveWorkflows: vi.fn<StorageAdapter['getEffectiveWorkflows']>(() => []),
    claimPendingJobRuns: claim,
    enqueueJobRun: vi.fn<StorageAdapter['enqueueJobRun']>(() => 'run-new'),
    updateJobRunStatus: vi.fn<StorageAdapter['updateJobRunStatus']>(() => undefined),
  }
}

describe('job runner', () => {
  describe('processOnce', () => {
    it('passes job input and ExecutorContext to the executor', async () => {
      const adapter = makeAdapter([makePendingJob({ depth: 2 })])
      const executors = createExecutorRegistry()
      const executor = vi.fn(async () => ({ output: { done: true } }))
      executors.register('test:run', executor, { label: 'Test', category: 'T' })
      const engine = createWorkflowEngine({ adapter })
      const runner = createJobRunner({ adapter, executors, engine, scopeId: 'ws-1' })

      await runner.processOnce()

      expect(executor).toHaveBeenCalledWith(
        { target_id: 't1' },
        expect.objectContaining({ scopeId: 'ws-1', depth: 2 }),
      )
    })

    it('updates job status to running, then completed', async () => {
      const adapter = makeAdapter([makePendingJob()])
      const executors = createExecutorRegistry()
      executors.register('test:run', async () => ({ output: { done: true } }), {
        label: 'T',
        category: 'T',
      })
      const engine = createWorkflowEngine({ adapter })
      const runner = createJobRunner({ adapter, executors, engine, scopeId: null })

      await runner.processOnce()

      expect(adapter.updateJobRunStatus).toHaveBeenNthCalledWith(1, 'run-1', 'running')
      expect(adapter.updateJobRunStatus).toHaveBeenNthCalledWith(
        2,
        'run-1',
        'completed',
        { done: true },
        undefined,
      )
    })

    it('cascades events at job.depth so children land at job.depth + 1', async () => {
      // Regression test for the depth divergence: the runner must cascade at
      // job.depth and let engine.dispatch add the +1.
      const adapter = makeAdapter([makePendingJob({ depth: 1 })])
      const executors = createExecutorRegistry()
      executors.register(
        'test:run',
        async () => ({
          output: { done: true },
          events: [{ type: 'evt:next', payload: { foo: 'bar' } }],
        }),
        { label: 'T', category: 'T' },
      )
      const engine = createWorkflowEngine({ adapter })
      const dispatchSpy = vi.spyOn(engine, 'dispatch')
      const runner = createJobRunner({ adapter, executors, engine, scopeId: 'ws-1' })

      await runner.processOnce()

      expect(dispatchSpy).toHaveBeenCalledWith(
        { type: 'evt:next', payload: { foo: 'bar' } },
        { scopeId: 'ws-1', depth: 1 },
      )
    })

    it('marks jobs failed when the executor throws', async () => {
      const adapter = makeAdapter([makePendingJob()])
      const executors = createExecutorRegistry()
      executors.register(
        'test:run',
        async () => {
          throw new Error('boom')
        },
        { label: 'T', category: 'T' },
      )
      const engine = createWorkflowEngine({ adapter })
      const runner = createJobRunner({ adapter, executors, engine, scopeId: null })

      await runner.processOnce()

      expect(adapter.updateJobRunStatus).toHaveBeenCalledWith(
        'run-1',
        'failed',
        undefined,
        expect.stringContaining('boom'),
      )
    })

    it('does NOT retry when maxRetries is 0 (default)', async () => {
      const adapter = makeAdapter([makePendingJob()])
      const executors = createExecutorRegistry()
      executors.register(
        'test:run',
        async () => {
          throw new Error('boom')
        },
        { label: 'T', category: 'T' },
      )
      const engine = createWorkflowEngine({ adapter })
      const runner = createJobRunner({ adapter, executors, engine, scopeId: null })

      await runner.processOnce()

      expect(adapter.enqueueJobRun).not.toHaveBeenCalled()
    })

    it('re-enqueues with retryCount+1 when retry_count < maxRetries', async () => {
      const adapter = makeAdapter([makePendingJob({ retry_count: 0 })])
      const executors = createExecutorRegistry()
      executors.register(
        'test:run',
        async () => {
          throw new Error('boom')
        },
        { label: 'T', category: 'T' },
      )
      const engine = createWorkflowEngine({ adapter })
      const runner = createJobRunner({
        adapter,
        executors,
        engine,
        scopeId: null,
        maxRetries: 2,
      })

      await runner.processOnce()

      expect(adapter.enqueueJobRun).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: 'test:run',
          retryCount: 1,
          depth: 0,
        }),
      )
    })

    it('does NOT retry when retry_count has reached maxRetries', async () => {
      const adapter = makeAdapter([makePendingJob({ retry_count: 2 })])
      const executors = createExecutorRegistry()
      executors.register(
        'test:run',
        async () => {
          throw new Error('boom')
        },
        { label: 'T', category: 'T' },
      )
      const engine = createWorkflowEngine({ adapter })
      const runner = createJobRunner({
        adapter,
        executors,
        engine,
        scopeId: null,
        maxRetries: 2,
      })

      await runner.processOnce()

      expect(adapter.enqueueJobRun).not.toHaveBeenCalled()
    })

    it('onEvent receives job:started and job:completed events', async () => {
      const adapter = makeAdapter([makePendingJob()])
      const executors = createExecutorRegistry()
      executors.register('test:run', async () => ({ output: { ok: true } }), {
        label: 'T',
        category: 'T',
      })
      const engine = createWorkflowEngine({ adapter })
      const runner = createJobRunner({ adapter, executors, engine, scopeId: null })

      const events: RunnerEvent[] = []
      runner.onEvent((e) => events.push(e))

      await runner.processOnce()

      expect(events.some((e) => e.type === 'job:started')).toBe(true)
      expect(events.some((e) => e.type === 'job:completed')).toBe(true)
    })

    it('onEvent returns an unsubscribe function', async () => {
      const adapter = makeAdapter([makePendingJob()])
      const executors = createExecutorRegistry()
      executors.register('test:run', async () => ({ output: {} }), { label: 'T', category: 'T' })
      const engine = createWorkflowEngine({ adapter })
      const runner = createJobRunner({ adapter, executors, engine, scopeId: null })

      const events: RunnerEvent[] = []
      const unsub = runner.onEvent((e) => events.push(e))
      unsub()

      await runner.processOnce()

      expect(events).toEqual([])
    })

    it('emits job:failed when executor throws', async () => {
      const adapter = makeAdapter([makePendingJob()])
      const executors = createExecutorRegistry()
      executors.register(
        'test:run',
        async () => {
          throw new Error('nope')
        },
        { label: 'T', category: 'T' },
      )
      const engine = createWorkflowEngine({ adapter })
      const runner = createJobRunner({ adapter, executors, engine, scopeId: null })

      const events: RunnerEvent[] = []
      runner.onEvent((e) => events.push(e))

      await runner.processOnce()

      expect(events.find((e) => e.type === 'job:failed')).toBeDefined()
    })

    it('calls optional commit() after each status change', async () => {
      const base = makeAdapter([makePendingJob()])
      const commit = vi.fn()
      const adapter: StorageAdapter = { ...base, commit }
      const executors = createExecutorRegistry()
      executors.register('test:run', async () => ({ output: {} }), { label: 'T', category: 'T' })
      const engine = createWorkflowEngine({ adapter })
      const runner = createJobRunner({ adapter, executors, engine, scopeId: null })

      await runner.processOnce()

      // running + completed
      expect(commit).toHaveBeenCalledTimes(2)
    })

    it('drives a full cascade through the in-memory adapter', async () => {
      // first job emits an event that triggers a second workflow.
      const adapter = createMemoryAdapter({
        workflows: [
          {
            id: 'wf-2',
            source_lens: 'lens:x',
            trigger_event: 'evt:next',
            condition_field: null,
            condition_value: null,
            enabled: true,
            jobs: [
              {
                id: 'wj-2',
                workflow_id: 'wf-2',
                job_type: 'second:run',
                params: {},
                sort_order: 0,
                delay_ms: 0,
              },
            ],
          },
        ],
      })
      // seed an initial pending job.
      adapter.enqueueJobRun({
        workflowId: 'wf-1',
        workflowJobId: 'wj-1',
        jobType: 'first:run',
        input: {},
        depth: 0,
      })

      const executors = createExecutorRegistry()
      executors.register(
        'first:run',
        async () => ({ output: {}, events: [{ type: 'evt:next', payload: {} }] }),
        { label: 'First', category: 'T' },
      )
      const executors2 = vi.fn(async () => ({ output: { ok: true } }))
      executors.register('second:run', executors2, { label: 'Second', category: 'T' })

      const engine = createWorkflowEngine({ adapter })
      const runner = createJobRunner({ adapter, executors, engine, scopeId: null })

      // first tick processes first:run and enqueues second:run at depth 1.
      await runner.processOnce()
      const second = adapter.jobRuns.find((r) => r.job_type === 'second:run')
      expect(second).toBeDefined()
      expect(second?.depth).toBe(1)

      // second tick processes second:run.
      await runner.processOnce()
      expect(executors2).toHaveBeenCalled()
    })
  })

  describe('start / stop / isRunning', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('isRunning is false before start, true after start, false after stop', () => {
      const adapter = makeAdapter([])
      const executors = createExecutorRegistry()
      const engine = createWorkflowEngine({ adapter })
      const runner = createJobRunner({ adapter, executors, engine, scopeId: null })

      expect(runner.isRunning()).toBe(false)
      runner.start()
      expect(runner.isRunning()).toBe(true)
      runner.stop()
      expect(runner.isRunning()).toBe(false)
    })

    it('polls the adapter on the configured interval', async () => {
      const adapter = makeAdapter([])
      const executors = createExecutorRegistry()
      const engine = createWorkflowEngine({ adapter })
      const runner = createJobRunner({ adapter, executors, engine, scopeId: null })

      runner.start(500)
      await vi.advanceTimersByTimeAsync(500)
      await vi.advanceTimersByTimeAsync(500)
      runner.stop()
      expect(adapter.claimPendingJobRuns.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })
})
