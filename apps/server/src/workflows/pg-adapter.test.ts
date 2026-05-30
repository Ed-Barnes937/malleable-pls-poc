import { describe, it, expect } from 'vitest'
import type { TransactionSql } from 'postgres'
import { createPgAdapter } from './pg-adapter'

// createPgAdapter has only type-only imports (postgres, @pls/workflows), so it
// is pure logic over the injected `sql` tagged-template. We fake `sql` to
// capture the interpolated values and return canned rows — no database needed.
// This covers the adapter's own logic: backoff scheduling, _userId injection,
// the status->statement branch, and userId/scopeId threading.

interface Call {
  text: string
  values: unknown[]
}

function makeSql(result: unknown[] = []) {
  const calls: Call[] = []
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join('?'), values })
    return Promise.resolve(result)
  }
  return { sql: sql as unknown as TransactionSql, calls }
}

describe('createPgAdapter — enqueueJobRun', () => {
  it('injects _userId into the persisted input and threads scoping args', async () => {
    const { sql, calls } = makeSql([{ id: 'new-run' }])
    const adapter = createPgAdapter({ sql, userId: 'user-1' })

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
      const { sql, calls } = makeSql([{ id: 'r' }])
      const adapter = createPgAdapter({ sql, userId: 'user-1' })
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
  it('scopes by userId and returns the rows verbatim', async () => {
    const rows = [{ id: 'r1', job_type: 'ai:transcribe', depth: 1, retry_count: 0 }]
    const { sql, calls } = makeSql(rows)
    const adapter = createPgAdapter({ sql, userId: 'user-1' })

    const result = await adapter.claimPendingJobRuns()

    expect(result).toBe(rows)
    expect(calls[0].text).toContain("status = 'pending'")
    expect(calls[0].text).toContain('run_after <= now()')
    expect(calls[0].values).toContain('user-1')
  })
})

describe('createPgAdapter — getEffectiveWorkflows', () => {
  it('threads triggerEvent, userId, and scopeId(workspaceId) into the query', async () => {
    const { sql, calls } = makeSql([])
    const adapter = createPgAdapter({ sql, userId: 'user-1' })

    await adapter.getEffectiveWorkflows('recording:completed', 'ws-1')

    expect(calls[0].values).toEqual(['recording:completed', 'user-1', 'ws-1'])
  })
})

describe('createPgAdapter — updateJobRunStatus', () => {
  it('uses the running statement (started_at, no output)', async () => {
    const { sql, calls } = makeSql()
    const adapter = createPgAdapter({ sql, userId: 'user-1' })

    await adapter.updateJobRunStatus('r1', 'running')

    expect(calls[0].text).toContain("status = 'running'")
    expect(calls[0].text).toContain('started_at = now()')
    expect(calls[0].values).toEqual(['r1'])
  })

  it('serializes output for completed and null when absent', async () => {
    {
      const { sql, calls } = makeSql()
      const adapter = createPgAdapter({ sql, userId: 'user-1' })
      await adapter.updateJobRunStatus('r1', 'completed', { segments: 3 })
      expect(calls[0].text).toContain("status = 'completed'")
      expect(calls[0].values).toEqual(['{"segments":3}', 'r1'])
    }
    {
      const { sql, calls } = makeSql()
      const adapter = createPgAdapter({ sql, userId: 'user-1' })
      await adapter.updateJobRunStatus('r1', 'completed')
      expect(calls[0].values).toEqual([null, 'r1'])
    }
  })

  it('records the error for failed', async () => {
    const { sql, calls } = makeSql()
    const adapter = createPgAdapter({ sql, userId: 'user-1' })

    await adapter.updateJobRunStatus('r1', 'failed', undefined, 'boom')

    expect(calls[0].text).toContain("status = 'failed'")
    expect(calls[0].values).toEqual(['boom', 'r1'])
  })
})

describe('createPgAdapter — optional hooks', () => {
  it('omits commit (the surrounding sql.begin auto-commits)', () => {
    const { sql } = makeSql()
    const adapter = createPgAdapter({ sql, userId: 'user-1' })
    expect(adapter.commit).toBeUndefined()
    expect(adapter.isDuplicate).toBeUndefined()
  })
})
