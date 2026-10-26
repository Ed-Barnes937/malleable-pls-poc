// TODO: make playwright/backend-simulator/seed-data.ts the single source of
// truth for seed fixtures. Currently 002_seed.sql / 008_seed_panels.sql are
// maintained separately and have already drifted (panel pixel positions differ
// between the two). Unifying requires mapping TS field names to SQL columns and
// injecting user_id = 'dev-user-1' at insert time — low risk but non-trivial.

import { readFileSync } from 'fs'
import { createRequire } from 'module'
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
  // postgres is a dependency of @pls/db, not the root — resolve it from there.
  const requireFromDb = createRequire(resolve(__dirname, '../packages/db/package.json'))
  const pg = await import(requireFromDb.resolve('postgres'))
  const sql = pg.default(DATABASE_URL, { max: 1 })

  try {
    for (const table of TABLES) {
      await sql.unsafe(`DELETE FROM ${table} WHERE user_id = 'dev-user-1'`)
    }

    // 002 seeds reference data; 008 seeds the freeform-canvas panels (pixel
    // columns), since 006 replaced the grid columns 002 originally used;
    // 010 moves the seeded recording focus from panel config to the
    // workspace scope.
    for (const file of ['002_seed.sql', '008_seed_panels.sql', '010_seed_recording_focus.sql']) {
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
