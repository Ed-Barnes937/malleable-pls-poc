// Usage: node scripts/with-db-url.mts <command> [args...]
// Runs the command with DATABASE_URL resolved by e2e/db-url.ts (an exported
// DATABASE_URL wins, else built from PG_PORT / PG_DB).
import { spawnSync } from 'node:child_process'
import { resolveDatabaseUrl } from '../e2e/db-url.ts'

const [cmd, ...args] = process.argv.slice(2)
if (!cmd) {
  console.error('usage: with-db-url <command> [args...]')
  process.exit(2)
}
const env = { ...process.env, DATABASE_URL: resolveDatabaseUrl() }
const r = spawnSync(cmd, args, { stdio: 'inherit', env })
process.exit(r.status ?? 1)
