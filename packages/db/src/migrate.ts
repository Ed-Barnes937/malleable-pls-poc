import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from './pool'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, 'migrations')

async function ensureMigrationTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
}

async function getApplied(): Promise<Set<string>> {
  const rows = await sql<{ name: string }[]>`SELECT name FROM _migrations ORDER BY id`
  return new Set(rows.map((r: { name: string }) => r.name))
}

async function migrate() {
  await ensureMigrationTable()
  const applied = await getApplied()

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}`)
      continue
    }
    const content = await readFile(join(migrationsDir, file), 'utf-8')
    console.log(`  apply ${file}`)
    await sql.begin(async (tx) => {
      await tx.unsafe(content)
      await tx`INSERT INTO _migrations (name) VALUES (${file})`
    })
  }

  console.log('migrations complete')
  await sql.end()
}

migrate().catch((err) => {
  console.error('migration failed:', err)
  process.exit(1)
})
