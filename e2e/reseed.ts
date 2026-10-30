// TODO: make playwright/backend-simulator/seed-data.ts the single source of
// truth for seed fixtures. Currently 002_seed.sql / 008_seed_panels.sql are
// maintained separately and have already drifted (panel pixel positions differ
// between the two). Unifying requires mapping TS field names to SQL columns and
// injecting user_id = 'dev-user-1' at insert time — low risk but non-trivial.

import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { resolve } from 'path'
import { resolveDatabaseUrl } from './db-url.mts'
import { validatePlanItem } from '../packages/substrate/src/plan-items'
import { priyaWeek, seededReviews, type SeedPlanItem } from './seed-week'

const DATABASE_URL = resolveDatabaseUrl()

const TABLES = [
  'plan_items', 'user_preferences',
  'job_runs', 'workflow_jobs', 'workflows',
  'workspace_scopes', 'workspace_panels', 'workspaces',
  'confidence_signals', 'links', 'annotations', 'tags',
  'transcript_segments', 'recordings', 'lectures',
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
    // One transaction: the server never sees a half-seeded student, nor
    // recordings without a lecture (see 017 below).
    await sql.begin(async (tx: Sql) => {
      for (const table of TABLES) {
        await tx.unsafe(`DELETE FROM ${table} WHERE user_id = 'dev-user-1'`)
      }
      // 002 inserts recordings the pre-017 way (no lecture, course as a
      // tag); 017 gives each its lecture and restores NOT NULL before the
      // transaction ends.
      await tx.unsafe('ALTER TABLE recordings ALTER COLUMN lecture_id DROP NOT NULL')
      // Re-running 017 says "already exists, skipping" for each IF NOT EXISTS.
      await tx.unsafe('SET LOCAL client_min_messages = warning')

      // 002 seeds reference data; 008 seeds the freeform-canvas panels (pixel
      // columns), since 006 replaced the grid columns 002 originally used;
      // 010 moves the seeded recording focus from panel config to the
      // workspace scope; 012 drops the timeframe scope rows 002 still inserts;
      // 013 swaps the stub automations for the lecture AI ones; 014 resizes
      // the seeded panels for the redesigned widget chrome; 017 files each
      // seeded recording under its own lecture ('lec-' || recording id).
      for (const file of ['002_seed.sql', '008_seed_panels.sql', '010_seed_recording_focus.sql', '012_drop_timeframe_scope.sql', '013_lecture_ai_automations.sql', '014_seed_panel_sizes.sql', '017_lectures.sql']) {
        const seedSql = readFileSync(
          resolve(__dirname, `../packages/db/src/migrations/${file}`),
          'utf-8',
        )
        await tx.unsafe(seedSql)
      }

      await insertPlanItems(tx, [...priyaWeek(now), ...seededReviews()])
    })
  } finally {
    await sql.end()
  }
}

// `postgres` is resolved at runtime from @pls/db (see above), so its types
// are not visible here.
type Sql = any

/** Inserts plan items for dev-user-1 with their course as a 'plan_item' tag, as the server stores them. */
export async function insertPlanItems(sql: Sql, items: SeedPlanItem[]) {
  for (const { id, course, created_at, updated_at, ...item } of items) {
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
        created_by_workflow_id: item.created_by_workflow_id ?? null,
        ...(created_at ? { created_at } : {}),
        ...(updated_at ? { updated_at } : {}),
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
