import { expect } from 'vitest'
import type { Sql, TxSql } from '@pls/db'

/**
 * For db race tests: hold locks in a transaction of one's own, and wait on
 * lock state (`pg_blocking_pids` of the holder's backend), never on time.
 */
export function lockProbes(sql: Sql) {
  /**
   * Runs `lock` in a transaction of its own and holds what it locked until
   * `release`. `pid` is its backend.
   */
  const hold = async (lock: (tx: TxSql) => Promise<unknown>) => {
    let pid = 0
    let held!: () => void
    const holding = new Promise<void>((done) => { held = done })
    let release!: () => void
    const released = new Promise<void>((done) => { release = done })
    const done = sql.begin(async (tx) => {
      pid = (await tx`SELECT pg_backend_pid() AS pid`)[0].pid as number
      await lock(tx)
      held()
      await released
    })
    await holding
    return { pid, release: async () => { release(); await done } }
  }

  /**
   * Holds the board (FOR NO KEY UPDATE) and its scope rows (FOR UPDATE), as
   * a scope write on it under way does.
   */
  const holdBoard = (workspaceId: string) => hold(async (tx) => {
    await tx`SELECT id FROM workspaces WHERE id = ${workspaceId} FOR NO KEY UPDATE`
    await tx`SELECT id FROM workspace_scopes WHERE workspace_id = ${workspaceId} FOR UPDATE`
  })

  /**
   * Holds only the board's lecture row (FOR UPDATE): a course change
   * refiling this board and one before it (in workspace id order) then
   * waits here with the earlier board's lecture row locked, and no course
   * row yet.
   */
  const holdLectureRow = (workspaceId: string) => hold(async (tx) => {
    await tx`SELECT id FROM workspace_scopes WHERE workspace_id = ${workspaceId} AND scope_type = 'lecture' FOR UPDATE`
  })

  /** How many backends wait on `pid`, and how many wait on one of those. */
  const waiting = async (pid: number) => (await sql`
    SELECT
      (SELECT count(*)::int FROM pg_stat_activity a WHERE ${pid}::int = ANY(pg_blocking_pids(a.pid))) AS on_it,
      (SELECT count(*)::int FROM pg_stat_activity a WHERE EXISTS (
        SELECT 1 FROM pg_stat_activity b
        WHERE ${pid}::int = ANY(pg_blocking_pids(b.pid)) AND b.pid = ANY(pg_blocking_pids(a.pid))
      )) AS behind_those
  `)[0] as { on_it: number; behind_those: number }

  /**
   * Starts `write` and waits until it has either finished or is waiting
   * behind the transaction blocked on `pid` (the course change): what it
   * would read or lock before then is the question each race test asks.
   * Returns the write's outcome, still to come.
   */
  const settledOrBehind = async <T>(pid: number, write: () => Promise<T>): Promise<{ outcome: Promise<T> }> => {
    let settled = false
    const outcome = write().finally(() => { settled = true })
    // Not left unhandled while the poll runs; awaited by the caller.
    outcome.catch(() => {})
    await expect.poll(async () => settled || (await waiting(pid)).behind_those === 1).toBe(true)
    return { outcome }
  }

  /** The boards' ids in the order a course change locks their rows. */
  const inLockOrder = async (workspaceIds: string[]) =>
    (await sql`SELECT id FROM workspaces WHERE id = ANY(${workspaceIds}) ORDER BY id`).map((r) => r.id as string)

  return { hold, holdBoard, holdLectureRow, waiting, settledOrBehind, inLockOrder }
}
