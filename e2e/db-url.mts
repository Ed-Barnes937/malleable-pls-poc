/**
 * The one place the dev/e2e database URL is resolved. An exported DATABASE_URL
 * always wins (so an agent that points its shell at a ticket database cannot
 * silently hit the default one); otherwise it is built from PG_PORT / PG_DB.
 */
export function resolveDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.DATABASE_URL) return env.DATABASE_URL
  const port = env.PG_PORT || '5433'
  const db = env.PG_DB || 'malleable_pls'
  return `postgres://pls:pls@localhost:${port}/${db}`
}
