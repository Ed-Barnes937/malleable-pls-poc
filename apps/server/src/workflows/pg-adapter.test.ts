import { describe, it, expect } from 'vitest'
import type { TransactionSql } from 'postgres'
import type { Sql } from '@pls/db'
import { createPgAdapter } from './pg-adapter'

// Two test helpers matching the two adapter modes:
//
// makeTxSql — dispatch mode ({ tx, userId }). The caller owns the transaction;
//   the adapter uses `tx` directly. No sql.begin in the adapter, so the mock
//   only needs to be a tagged-template function.
//
// makeRunnerSql — runner mode ({ sql, userId }). The adapter calls sql.begin
//   internally, so the mock must also expose begin(). Calls[0] will be the
//   set_config, calls[1] the actual query.

interface Call {
  text: string
  values: unknown[]
}

// Mirrors postgres.js fragment composition: a lazy query embedded as a value
// (e.g. `workflowJobsJson(tx)`) splices its text/values into the outer query
// instead of being recorded as a separate call.
function makeTagged(calls: Call[], result: unknown[]) {
  return (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0]
    const flat: unknown[] = []
    for (let i = 0; i < values.length; i++) {
      const v = values[i] as { __fragment?: Call }
      if (v && typeof v === 'object' && v.__fragment) {
        const frag = v.__fragment
        const idx = calls.indexOf(frag)
        if (idx >= 0) calls.splice(idx, 1)
        text += frag.text
        flat.push(...frag.values)
      } else {
        flat.push(values[i])
        text += '?'
      }
      text += strings[i + 1]
    }
    const call: Call = { text, values: flat }
    calls.push(call)
    const p = Promise.resolve(result) as Promise<unknown[]> & { __fragment: Call }
    p.__fragment = call
    return p
  }
}

function makeTxSql(result: unknown[] = []) {
  const calls: Call[] = []
  const tx = makeTagged(calls, result)
  return { tx: tx as unknown as TransactionSql, calls }
}

function makeRunnerSql(result: unknown[] = []) {
  const calls: Call[] = []
  const tagged = makeTagged(calls, result) as ReturnType<typeof makeTagged> & {
    begin: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
  }
  tagged.begin = async (fn) => fn(tagged)
  return { sql: tagged as unknown as Sql, calls }
}

describe('createPgAdapter — enqueueJobRun', () => {
  it('injects _userId into the persisted input and threads scoping args', async () => {
    const { tx, calls } = makeTxSql([{ id: 'new-run' }])
    const adapter = createPgAdapter({ tx, userId: 'user-1' })

    const id = await adapter.enqueueJobRun({
      workflowId: 'w1',
      workflowJobId: 'j1',
      jobType: 'ai:transcribe',
      input: { target_id: 'rec-1' },
      depth: 1,
    })

    expect(id).toBe('new-run')
    const [userId, workflowId, workflowJobId, jobType, inputJson, depth, retryCount, backoff] =
      calls[0].values
    expect(userId).toBe('user-1')
    expect(workflowId).toBe('w1')
    expect(workflowJobId).toBe('j1')
    expect(jobType).toBe('ai:transcribe')
    expect(JSON.parse(inputJson as string)).toEqual({ target_id: 'rec-1', _userId: 'user-1' })
    expect(depth).toBe(1)
    expect(retryCount).toBe(0)
    expect(backoff).toBe('0ms')
  })

  it('applies exponential backoff for retries, capped at 60s', async () => {
    const cases: Array<[number, string]> = [
      [1, '2000ms'],
      [2, '4000ms'],
      [3, '8000ms'],
      [10, '60000ms'], // 2^10 * 1000 = 1_024_000 -> capped
    ]
    for (const [retryCount, expectedBackoff] of cases) {
      const { tx, calls } = makeTxSql([{ id: 'r' }])
      const adapter = createPgAdapter({ tx, userId: 'user-1' })
      await adapter.enqueueJobRun({
        workflowId: 'w1',
        workflowJobId: 'j1',
        jobType: 'ai:transcribe',
        input: {},
        depth: 1,
        retryCount,
      })
      expect(calls[0].values[6]).toBe(retryCount)
      expect(calls[0].values[7]).toBe(expectedBackoff)
    }
  })
})

describe('createPgAdapter — claimPendingJobRuns', () => {
  it('atomically flips to running with FOR UPDATE SKIP LOCKED', async () => {
    const rows = [{ id: 'r1', status: 'running', job_type: 'ai:transcribe', depth: 1, retry_count: 0 }]
    const { tx, calls } = makeTxSql(rows)
    const adapter = createPgAdapter({ tx, userId: 'user-1' })

    const result = await adapter.claimPendingJobRuns()

    expect(result).toBe(rows)
    expect(calls[0].text).toContain('FOR UPDATE SKIP LOCKED')
    expect(calls[0].text).toContain("SET status = 'running'")
    expect(calls[0].text).toContain("status = 'pending'")
    expect(calls[0].text).toContain('run_after <= now()')
    expect(calls[0].values).toContain('user-1')
  })
})

describe('createPgAdapter — getEffectiveWorkflows', () => {
  it('threads triggerEvent, userId, and scopeId(workspaceId) into the query', async () => {
    const { tx, calls } = makeTxSql([])
    const adapter = createPgAdapter({ tx, userId: 'user-1' })

    await adapter.getEffectiveWorkflows('recording:completed', 'ws-1')

    expect(calls[0].values).toEqual(['recording:completed', 'user-1', 'ws-1'])
  })

  it('uses DISTINCT ON and workspace_id NULLS LAST to resolve overrides', async () => {
    const { tx, calls } = makeTxSql([])
    const adapter = createPgAdapter({ tx, userId: 'user-1' })

    await adapter.getEffectiveWorkflows('recording:completed', 'ws-1')

    expect(calls[0].text).toContain('DISTINCT ON (source_lens, condition_field, condition_value)')
    expect(calls[0].text).toContain('workspace_id NULLS LAST')
  })
})

describe('createPgAdapter — updateJobRunStatus', () => {
  it('uses the running statement (started_at, no output)', async () => {
    const { tx, calls } = makeTxSql()
    const adapter = createPgAdapter({ tx, userId: 'user-1' })

    await adapter.updateJobRunStatus('r1', 'running')

    expect(calls[0].text).toContain("status = 'running'")
    expect(calls[0].text).toContain('started_at = now()')
    expect(calls[0].values).toEqual(['r1'])
  })

  it('serializes output for completed and null when absent', async () => {
    {
      const { tx, calls } = makeTxSql()
      const adapter = createPgAdapter({ tx, userId: 'user-1' })
      await adapter.updateJobRunStatus('r1', 'completed', { segments: 3 })
      expect(calls[0].text).toContain("status = 'completed'")
      expect(calls[0].values).toEqual(['{"segments":3}', 'r1'])
    }
    {
      const { tx, calls } = makeTxSql()
      const adapter = createPgAdapter({ tx, userId: 'user-1' })
      await adapter.updateJobRunStatus('r1', 'completed')
      expect(calls[0].values).toEqual([null, 'r1'])
    }
  })

  it('records the error for failed', async () => {
    const { tx, calls } = makeTxSql()
    const adapter = createPgAdapter({ tx, userId: 'user-1' })

    await adapter.updateJobRunStatus('r1', 'failed', undefined, 'boom')

    expect(calls[0].text).toContain("status = 'failed'")
    expect(calls[0].values).toEqual(['boom', 'r1'])
  })
})

describe('createPgAdapter — optional hooks', () => {
  it('omits commit (tx auto-commits or each withDb call auto-commits)', () => {
    const { tx } = makeTxSql()
    const adapter = createPgAdapter({ tx, userId: 'user-1' })
    expect(adapter.commit).toBeUndefined()
    expect(adapter.isDuplicate).toBeUndefined()
  })
})

describe('createPgAdapter — runner mode (sql path)', () => {
  it('wraps each call in its own begin + set_config', async () => {
    const { sql, calls } = makeRunnerSql([])
    const adapter = createPgAdapter({ sql, userId: 'user-1' })

    await adapter.getEffectiveWorkflows('recording:completed', 'ws-1')

    // calls[0] = set_config, calls[1] = the CTE query
    expect(calls[0].text).toContain('set_config')
    expect(calls[0].values).toContain('user-1')
    expect(calls[1].values).toEqual(['recording:completed', 'user-1', 'ws-1'])
  })
})
