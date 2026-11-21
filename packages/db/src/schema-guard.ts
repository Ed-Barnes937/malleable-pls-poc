// Refuses to migrate or reseed a database whose schema this checkout does not
// know. Every checkout shares one Postgres container, so a database another
// branch migrated (see e2e/README.md "Isolation") can have migrations applied
// that are not in this checkout's migrations/ folder; writing to it from here
// fails part-way at best and corrupts someone else's data at worst.
import { readdir } from 'node:fs/promises'
import type { Sql, TransactionSql } from 'postgres'

export interface MigrationDrift {
  /** Applied in the database but not in this checkout: another branch's schema. */
  unknown: string[]
  /** In this checkout but not yet applied: the database is behind. */
  pending: string[]
}

export function compareMigrations(applied: Iterable<string>, available: Iterable<string>): MigrationDrift {
  const appliedSet = new Set(applied)
  const availableSet = new Set(available)
  return {
    unknown: [...appliedSet].filter((name) => !availableSet.has(name)).sort(),
    pending: [...availableSet].filter((name) => !appliedSet.has(name)).sort(),
  }
}

export interface SchemaGuardOptions {
  /** What is about to run, for the message ("migrate", "reseed"). */
  action: string
  /** Pending migrations are fine for migrate (it applies them), not for reseed. */
  allowPending: boolean
  /** This checkout's packages/db/src/migrations (callers resolve it, as e2e runs as CommonJS). */
  migrationsDir: string
}

/** The refusal message for this drift, or null when it is safe to go ahead. */
export function schemaMismatchMessage(
  drift: MigrationDrift,
  database: string,
  { action, allowPending }: Pick<SchemaGuardOptions, 'action' | 'allowPending'>,
): string | null {
  if (drift.unknown.length > 0) {
    return (
      `Refusing to ${action} database "${database}": it has migrations this checkout does not have ` +
      `(${drift.unknown.join(', ')}), so another branch migrated it. ` +
      'Use a database of your own, e.g. PG_DB=malleable_pls_<name> after ' +
      '`docker exec malleable-plc-poc-postgres-1 createdb -U pls malleable_pls_<name>` (see e2e/README.md).'
    )
  }
  if (!allowPending && drift.pending.length > 0) {
    return (
      `Refusing to ${action} database "${database}": it is missing migrations ` +
      `(${listSome(drift.pending)}). Run \`pnpm dev:migrate\` against it first (same PG_DB / DATABASE_URL).`
    )
  }
  return null
}

function listSome(names: string[], max = 3): string {
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`
}

export async function availableMigrations(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
}

/** Names in _migrations, or none when the table does not exist yet (a fresh database). */
async function appliedMigrations(sql: Sql | TransactionSql): Promise<string[]> {
  const [{ exists }] = await sql<{ exists: boolean }[]>`SELECT to_regclass('_migrations') IS NOT NULL AS exists`
  if (!exists) return []
  const rows = await sql<{ name: string }[]>`SELECT name FROM _migrations ORDER BY id`
  return rows.map((r) => r.name)
}

/** Throws unless the database's applied migrations match this checkout's (see schemaMismatchMessage). */
export async function assertSchemaMatches(sql: Sql | TransactionSql, options: SchemaGuardOptions): Promise<void> {
  const [{ database }] = await sql<{ database: string }[]>`SELECT current_database() AS database`
  const drift = compareMigrations(await appliedMigrations(sql), await availableMigrations(options.migrationsDir))
  const message = schemaMismatchMessage(drift, database, options)
  if (message) throw new Error(message)
}
