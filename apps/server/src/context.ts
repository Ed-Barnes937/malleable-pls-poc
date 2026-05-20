import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone'
import type { TransactionSql } from 'postgres'
import { sql } from '@pls/db'

export interface Context {
  userId: string
  sql: typeof sql
  withTenant: <T>(fn: (tx: TransactionSql) => Promise<T>) => Promise<T>
}

const USER_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/

export async function createContext({ req, info }: CreateHTTPContextOptions): Promise<Context> {
  const raw = (req.headers['x-user-id'] as string)
    ?? info.connectionParams?.['userId']
    ?? 'anonymous'
  const userId = USER_ID_RE.test(raw) ? raw : 'anonymous'

  return {
    userId,
    sql,
    withTenant: async <T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> => {
      return sql.begin(async (tx) => {
        await tx`SELECT set_config('app.current_user_id', ${userId}, true)`
        return fn(tx)
      }) as Promise<T>
    },
  }
}
