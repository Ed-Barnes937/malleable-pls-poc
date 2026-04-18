import initSqlJs, { type Database } from 'sql.js'
import { SCHEMA } from './schema'
import { seedDatabase } from './seed'

let dbInstance: Database | null = null
let initPromise: Promise<Database> | null = null

export async function initDb(): Promise<Database> {
  if (dbInstance) return dbInstance
  if (initPromise) return initPromise

  initPromise = (async () => {
    const SQL = await initSqlJs({
      locateFile: () => '/sql-wasm.wasm',
    })

    const saved = localStorage.getItem('pls-db')
    if (saved) {
      const buf = Uint8Array.from(atob(saved), (c) => c.charCodeAt(0))
      dbInstance = new SQL.Database(buf)
    } else {
      dbInstance = new SQL.Database()
      dbInstance.run(SCHEMA)
      seedDatabase(dbInstance)
      persistDb()
    }

    return dbInstance
  })()

  return initPromise
}

export function getDb(): Database {
  if (!dbInstance) throw new Error('Database not initialized. Call initDb() first.')
  return dbInstance
}

export function persistDb(): void {
  if (!dbInstance) return
  const data = dbInstance.export()
  const str = btoa(String.fromCharCode(...new Uint8Array(data)))
  localStorage.setItem('pls-db', str)
}

export function resetDb(): void {
  localStorage.removeItem('pls-db')
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
    initPromise = null
  }
}

export function query<T>(sql: string, params: unknown[] = []): T[] {
  const db = getDb()
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const results: T[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return results
}

export function exec(sql: string, params: unknown[] = []): void {
  const db = getDb()
  db.run(sql, params)
}
