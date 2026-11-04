// Usage: DATABASE_URL=... tsx src/ensure-database.ts
// For dev and e2e only (e2e:server runs it before migrating): checks the
// Postgres server in DATABASE_URL is reachable and creates the database if it
// is missing, so a fresh `PG_DB=foo pnpm test:e2e` just works. It never starts
// Postgres: `pnpm dev:db` is the only thing that touches the shared container.
import postgres from 'postgres'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('ensure-database: DATABASE_URL is not set')
  process.exit(2)
}

const target = new URL(databaseUrl)
const dbName = decodeURIComponent(target.pathname.slice(1))
const where = `${target.hostname}:${target.port || '5432'}`
// Connect to the maintenance database: the target may not exist yet.
const maintenance = new URL(databaseUrl)
maintenance.pathname = '/postgres'

const sql = postgres(maintenance.href, {
  max: 1,
  connect_timeout: 5,
  onnotice: () => {},
  ssl: process.env.DATABASE_SSL === 'require' ? 'require' : false,
})

function errorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined
}

try {
  try {
    await sql`SELECT 1`
  } catch (err) {
    const code = errorCode(err)
    const unreachable = code === 'ECONNREFUSED' || code === 'CONNECT_TIMEOUT' || code === 'ENOTFOUND'
    console.error(
      unreachable
        ? `Postgres isn't running on ${where}. Start it with \`pnpm dev:db\`.`
        : `Can't connect to Postgres on ${where}: ${err instanceof Error ? err.message : String(err)}`,
    )
    process.exit(1)
  }

  const existing = await sql`SELECT 1 FROM pg_database WHERE datname = ${dbName}`
  if (existing.length === 0) {
    try {
      await sql`CREATE DATABASE ${sql(dbName)}`
      console.log(`ensure-database: created ${dbName} on ${where}`)
    } catch (err) {
      // Another process created it between the check and the create.
      if (errorCode(err) !== '42P04') throw err
    }
  }
} finally {
  await sql.end()
}
