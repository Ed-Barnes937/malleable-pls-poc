import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createJobRunner } from './job-runner'
import { createExecutorRegistry } from './executor-registry'
import { createWorkflowEngine } from './engine'
import type { WorkflowStore, JobRun, JobRunnerEvent } from './types'

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
    created_at: '2026-04-24T00:00:00.000Z',
    started_at: null,
    completed_at: null,
    ...overrides,
  }
}

function makeStore(): WorkflowStore {
  return {
    getEffectiveWorkflows: vi.fn(() => []),
    getPendingJobRuns: vi.fn(() => []),
    enqueueJobRun: vi.fn((_wfId, wjId) => `run-${wjId}`),
    updateJobRunStatus: vi.fn(),
  }
}

describe('job runner', () => {
  describe('processOnce', () => {
    it('processes pending jobs from the store', async () => {
      const store = makeStore()
      const job = makePendingJob()
      ;(store.getPendingJobRuns as ReturnType<typeof vi.fn>).mockReturnValueOnce([job]).mockReturnValue([])

      const executors = createExecutorRegistry()
      const executor = vi.fn(async () => ({ output: { done: true } }))
      executors.register('test:run', executor, { label: 'Test', category: 'T' })

      const engine = createWorkflowEngine({ store, executors })
      const runner = createJobRunner({ store, executors, engine, scopeId: null })

      await runner.processOnce()

      expect(executor).toHaveBeenCalledWith({ target_id: 't1' })
    })

    it('updates job status to running, then completed', async () => {
      const store = makeStore()
      const job = makePendingJob()
      ;(store.getPendingJobRuns as ReturnType<typeof vi.fn>).mockReturnValueOnce([job]).mockReturnValue([])

      const executors = createExecutorRegistry()
      executors.register('test:run', async () => ({ output: { done: true } }), { label: 'T', category: 'T' })
      const engine = createWorkflowEngine({ store, executors })
      const runner = createJobRunner({ store, executors, engine, scopeId: null })

      await runner.processOnce()

      expect(store.updateJobRunStatus).toHaveBeenNthCalledWith(1, 'run-1', 'running')
      expect(store.updateJobRunStatus).toHaveBeenNthCalledWith(
        2,
        'run-1',
        'completed',
        { done: true },
        undefined,
      )
    })

    it('dispatches events from job results into the engine', async () => {
      const store = makeStore()
      const job = makePendingJob()
      ;(store.getPendingJobRuns as ReturnType<typeof vi.fn>).mockReturnValueOnce([job]).mockReturnValue([])

      const executors = createExecutorRegistry()
      executors.register(
        'test:run',
        async () => ({
          output: { done: true },
          events: [{ type: 'evt:next', payload: { foo: 'bar' } }],
        }),
        { label: 'T', category: 'T' },
      )
      const engine = createWorkflowEngine({ store, executors })
      const dispatchSpy = vi.spyOn(engine, 'dispatch')
      const runner = createJobRunner({ store, executors, engine, scopeId: 'ws-1' })

      await runner.processOnce()

      expect(dispatchSpy).toHaveBeenCalledWith('evt:next', { foo: 'bar' }, 'ws-1', 1)
    })

    it('marks jobs failed when the executor throws', async () => {
      const store = makeStore()
      const job = makePendingJob()
      ;(store.getPendingJobRuns as ReturnType<typeof vi.fn>).mockReturnValueOnce([job]).mockReturnValue([])

      const executors = createExecutorRegistry()
      executors.register('test:run', async () => {
        throw new Error('boom')
      }, { label: 'T', category: 'T' })
      const engine = createWorkflowEngine({ store, executors })
      const runner = createJobRunner({ store, executors, engine, scopeId: null })

      await runner.processOnce()

      expect(store.updateJobRunStatus).toHaveBeenCalledWith(
        'run-1',
        'failed',
        undefined,
        expect.stringContaining('boom'),
      )
    })

    it('onEvent listener receives job:started and job:completed events', async () => {
      const store = makeStore()
      const job = makePendingJob()
      ;(store.getPendingJobRuns as ReturnType<typeof vi.fn>).mockReturnValueOnce([job]).mockReturnValue([])

      const executors = createExecutorRegistry()
      executors.register('test:run', async () => ({ output: { ok: true } }), { label: 'T', category: 'T' })
      const engine = createWorkflowEngine({ store, executors })
      const runner = createJobRunner({ store, executors, engine, scopeId: null })

      const events: JobRunnerEvent[] = []
      runner.onEvent((e) => events.push(e))

      await runner.processOnce()

      expect(events.some((e) => e.type === 'job:started')).toBe(true)
      expect(events.some((e) => e.type === 'job:completed')).toBe(true)
    })

    it('onEvent returns an unsubscribe function', async () => {
      const store = makeStore()
      const job = makePendingJob()
      ;(store.getPendingJobRuns as ReturnType<typeof vi.fn>).mockReturnValueOnce([job]).mockReturnValue([])

      const executors = createExecutorRegistry()
      executors.register('test:run', async () => ({ output: {} }), { label: 'T', category: 'T' })
      const engine = createWorkflowEngine({ store, executors })
      const runner = createJobRunner({ store, executors, engine, scopeId: null })

      const events: JobRunnerEvent[] = []
      const unsub = runner.onEvent((e) => events.push(e))
      unsub()

      await runner.processOnce()

      expect(events).toEqual([])
    })

    it('emits job:failed when executor throws', async () => {
      const store = makeStore()
      const job = makePendingJob()
      ;(store.getPendingJobRuns as ReturnType<typeof vi.fn>).mockReturnValueOnce([job]).mockReturnValue([])

      const executors = createExecutorRegistry()
      executors.register('test:run', async () => {
        throw new Error('nope')
      }, { label: 'T', category: 'T' })
      const engine = createWorkflowEngine({ store, executors })
      const runner = createJobRunner({ store, executors, engine, scopeId: null })

      const events: JobRunnerEvent[] = []
      runner.onEvent((e) => events.push(e))

      await runner.processOnce()

      const failed = events.find((e) => e.type === 'job:failed')
      expect(failed).toBeDefined()
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
      const store = makeStore()
      const executors = createExecutorRegistry()
      const engine = createWorkflowEngine({ store, executors })
      const runner = createJobRunner({ store, executors, engine, scopeId: null })

      expect(runner.isRunning()).toBe(false)
      runner.start()
      expect(runner.isRunning()).toBe(true)
      runner.stop()
      expect(runner.isRunning()).toBe(false)
    })

    it('polls the store on the configured interval', async () => {
      const store = makeStore()
      const executors = createExecutorRegistry()
      const engine = createWorkflowEngine({ store, executors })
      const runner = createJobRunner({ store, executors, engine, scopeId: null })

      runner.start(500)
      // First poll should run after 500ms
      await vi.advanceTimersByTimeAsync(500)
      await vi.advanceTimersByTimeAsync(500)
      runner.stop()
      expect((store.getPendingJobRuns as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })
})
