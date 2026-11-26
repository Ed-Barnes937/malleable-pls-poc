// Usage: DATABASE_URL=... tsx src/ensure-database.ts
// For dev and e2e only (e2e:server runs it before migrating): checks the
// Postgres server in DATABASE_URL is reachable and creates the database if it
// is missing, so a fresh `PG_DB=foo pnpm test:e2e` just works. It never starts
// Postgres: `pnpm dev:db` is the only thing that touches the shared container.
import postgres from 'postgres'

/** The shared dev container `pnpm dev:db` starts (docker-compose.yml). */
const DEV_DB_PORT = '5433'

function fail(message: string): never {
  console.error(`ensure-database: ${message}`)
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) fail('DATABASE_URL is not set.')
if (!URL.canParse(databaseUrl)) {
  fail('DATABASE_URL is not a valid URL. Expected postgres://user:password@host:port/database (see e2e/README.md).')
}

const target = new URL(databaseUrl)
const dbName = decodeURIComponent(target.pathname.slice(1))
if (!dbName || dbName.includes('/')) {
  fail(`DATABASE_URL names no database (path "${target.pathname}"). Expected postgres://user:password@host:port/database.`)
}
const port = target.port || '5432'
const where = `${target.hostname}:${port}`
const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(target.hostname)
const howToStart = isLocal && port === DEV_DB_PORT
  ? 'Start it with `pnpm dev:db`.'
  : `\`pnpm dev:db\` only starts the shared container on localhost:${DEV_DB_PORT}; start this one yourself or point PG_PORT / DATABASE_URL at it.`

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
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') fail(`can't resolve the Postgres host "${target.hostname}" in DATABASE_URL.`)
    if (code === 'ECONNREFUSED' || code === 'CONNECT_TIMEOUT') fail(`Postgres isn't running on ${where}. ${howToStart}`)
    fail(`can't connect to Postgres on ${where}: ${err instanceof Error ? err.message : String(err)}`)
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
