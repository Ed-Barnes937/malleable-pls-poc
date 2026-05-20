import { readFileSync } from 'fs'
import { resolve } from 'path'

const pgPort = process.env.PG_PORT ?? '5433'
const DATABASE_URL =
  process.env.DATABASE_URL ?? `postgres://pls:pls@localhost:${pgPort}/malleable_pls`

const TABLES = [
  'job_runs', 'workflow_jobs', 'workflows',
  'workspace_scopes', 'workspace_panels', 'workspaces',
  'confidence_signals', 'links', 'annotations', 'tags',
  'transcript_segments', 'recordings',
]

export async function reseed() {
  const pg = await import(
    resolve(__dirname, '../node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/index.js')
  )
  const sql = pg.default(DATABASE_URL, { max: 1 })

  try {
    for (const table of TABLES) {
      await sql.unsafe(`DELETE FROM ${table} WHERE user_id = 'dev-user-1'`)
    }

    const seedPath = resolve(__dirname, '../packages/db/src/migrations/002_seed.sql')
    const seedSql = readFileSync(seedPath, 'utf-8')
    await sql.unsafe(seedSql)
  } finally {
    await sql.end()
  }
}
