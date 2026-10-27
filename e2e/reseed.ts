// TODO: make playwright/backend-simulator/seed-data.ts the single source of
// truth for seed fixtures. Currently 002_seed.sql / 008_seed_panels.sql are
// maintained separately and have already drifted (panel pixel positions differ
// between the two). Unifying requires mapping TS field names to SQL columns and
// injecting user_id = 'dev-user-1' at insert time — low risk but non-trivial.

import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { resolve } from 'path'
import { validatePlanItem } from '../packages/substrate/src/plan-items'
import { priyaWeek, type SeedPlanItem } from './seed-week'

const pgPort = process.env.PG_PORT ?? '5433'
// PG_DB isolates parallel checkouts/agents (see e2e/README.md).
const pgDb = process.env.PG_DB ?? 'malleable_pls'
const DATABASE_URL =
  process.env.DATABASE_URL ?? `postgres://pls:pls@localhost:${pgPort}/${pgDb}`

const TABLES = [
  'plan_items',
  'job_runs', 'workflow_jobs', 'workflows',
  'workspace_scopes', 'workspace_panels', 'workspaces',
  'confidence_signals', 'links', 'annotations', 'tags',
  'transcript_segments', 'recordings',
]

/** Where reseed writes, as "host:port/database" (never the credentials). */
export function reseedTarget(): string {
  const url = new URL(DATABASE_URL)
  return `${url.host}${url.pathname}`
}

export interface ReseedOptions {
  /**
   * The instant Priya's week is built around (see ./seed-week.ts). Defaults
   * to the real clock, so a reseed always looks like this week; tests and
   * rehearsals can pin it.
   */
  now?: number
}

export async function reseed({ now = Date.now() }: ReseedOptions = {}) {
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
    // workspace scope; 012 drops the timeframe scope rows 002 still inserts;
    // 013 swaps the stub automations for the lecture AI ones.
    for (const file of ['002_seed.sql', '008_seed_panels.sql', '010_seed_recording_focus.sql', '012_drop_timeframe_scope.sql', '013_lecture_ai_automations.sql']) {
      const seedSql = readFileSync(
        resolve(__dirname, `../packages/db/src/migrations/${file}`),
        'utf-8',
      )
      await sql.unsafe(seedSql)
    }

    await insertPlanItems(sql, priyaWeek(now))
  } finally {
    await sql.end()
  }
}

// `postgres` is resolved at runtime from @pls/db (see above), so its types
// are not visible here.
type Sql = any

/** Inserts plan items for dev-user-1 with their course as a 'plan_item' tag, as the server stores them. */
export async function insertPlanItems(sql: Sql, items: SeedPlanItem[]) {
  for (const { id, course, ...item } of items) {
    const invalid = validatePlanItem(item)
    if (invalid) throw new Error(`Seed plan item ${id}: ${invalid}`)
    await sql`
      INSERT INTO plan_items ${sql({
        id,
        user_id: 'dev-user-1',
        kind: item.kind,
        title: item.title,
        starts_at: item.starts_at ?? null,
        ends_at: item.ends_at ?? null,
        due_at: item.due_at ?? null,
        duration_min: item.duration_min ?? null,
        status: item.status ?? 'open',
        recurrence: item.recurrence ? sql.json({ ...item.recurrence }) : null,
        subtype: item.subtype ?? null,
        source_type: item.source_type ?? null,
        source_id: item.source_id ?? null,
        source_offset_ms: item.source_offset_ms ?? null,
      })}
    `
    if (course) {
      await sql`
        INSERT INTO tags (id, user_id, target_type, target_id, label)
        VALUES (${`tag-${id}`}, 'dev-user-1', 'plan_item', ${id}, ${course})
      `
    }
  }
}
