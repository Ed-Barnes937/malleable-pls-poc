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

    // 002 seeds reference data; 008 seeds the freeform-canvas panels (pixel
    // columns), since 006 replaced the grid columns 002 originally used.
    for (const file of ['002_seed.sql', '008_seed_panels.sql']) {
      const seedSql = readFileSync(
        resolve(__dirname, `../packages/db/src/migrations/${file}`),
        'utf-8',
      )
      await sql.unsafe(seedSql)
    }
  } finally {
    await sql.end()
  }
}
