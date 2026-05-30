import { describe, it, expect } from 'vitest'
import { createExecutorRegistry } from './executor-registry'
import type { ExecutorContext, JobRun } from './types'

function makeCtx(overrides: Partial<ExecutorContext> = {}): ExecutorContext {
  const jobRun: JobRun = {
    id: 'run-1',
    workflow_id: 'wf-1',
    workflow_job_id: 'wj-1',
    job_type: 'test:run',
    status: 'running',
    input: {},
    output: null,
    error: null,
    depth: 0,
    retry_count: 0,
    created_at: '2026-04-24T00:00:00.000Z',
    started_at: null,
    completed_at: null,
  }
  return { scopeId: null, depth: 0, jobRun, ...overrides }
}

describe('executor registry', () => {
  it('creates an empty registry', () => {
    const registry = createExecutorRegistry()
    expect(registry.getAvailableTypes()).toEqual([])
  })

  it('registers an executor', () => {
    const registry = createExecutorRegistry()
    registry.register('test:run', async () => ({ output: {} }), {
      label: 'Test Run',
      category: 'Test',
    })
    expect(registry.has('test:run')).toBe(true)
  })

  it('executes a registered job type and returns its result', async () => {
    const registry = createExecutorRegistry()
    registry.register(
      'math:double',
      async (input) => ({ output: { value: (input.n as number) * 2 } }),
      { label: 'Double', category: 'Math' },
    )
    const result = await registry.execute('math:double', { n: 21 }, makeCtx())
    expect(result.output).toEqual({ value: 42 })
  })

  it('passes ExecutorContext through to the executor', async () => {
    const registry = createExecutorRegistry()
    let seen: ExecutorContext | undefined
    registry.register(
      'ctx:peek',
      async (_input, ctx) => {
        seen = ctx
        return { output: {} }
      },
      { label: 'Peek', category: 'X' },
    )
    const ctx = makeCtx({ scopeId: 'ws-9', depth: 2 })
    await registry.execute('ctx:peek', {}, ctx)
    expect(seen?.scopeId).toBe('ws-9')
    expect(seen?.depth).toBe(2)
  })

  it('throws when executing an unregistered type', async () => {
    const registry = createExecutorRegistry()
    await expect(registry.execute('unknown', {}, makeCtx())).rejects.toThrow(/unknown/i)
  })

  it('returns all registered types with metadata', () => {
    const registry = createExecutorRegistry()
    registry.register('a', async () => ({ output: {} }), { label: 'A', category: 'X' })
    registry.register('b', async () => ({ output: {} }), { label: 'B', category: 'Y' })
    const types = registry.getAvailableTypes()
    expect(types).toContainEqual({ type: 'a', label: 'A', category: 'X' })
    expect(types).toContainEqual({ type: 'b', label: 'B', category: 'Y' })
    expect(types).toHaveLength(2)
  })

  it('has() returns true for registered, false for unregistered', () => {
    const registry = createExecutorRegistry()
    registry.register('known', async () => ({ output: {} }), { label: 'Known', category: 'X' })
    expect(registry.has('known')).toBe(true)
    expect(registry.has('missing')).toBe(false)
  })

  it('throws when registering the same type twice', () => {
    const registry = createExecutorRegistry()
    registry.register('dup', async () => ({ output: {} }), { label: 'Dup', category: 'X' })
    expect(() =>
      registry.register('dup', async () => ({ output: {} }), { label: 'Dup2', category: 'X' }),
    ).toThrow(/already registered/i)
  })
})
