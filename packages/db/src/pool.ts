import postgres, { type TransactionSql } from 'postgres'

const connectionString = process.env.DATABASE_URL ?? 'postgres://localhost:5432/malleable_pls'

export const sql = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: process.env.DATABASE_SSL === 'require' ? 'require' : false,
})

export type Sql = typeof sql
export type TxSql = TransactionSql

export async function withUser<T>(
  userId: string,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_user_id', ${userId}, true)`
    return fn(tx)
  }) as Promise<T>
}
