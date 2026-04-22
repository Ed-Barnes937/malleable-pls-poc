import initSqlJs, { type Database } from 'sql.js'
import { SCHEMA } from './schema'
import { seedDatabase } from './seed'

const SCHEMA_VERSION = 3

let dbInstance: Database | null = null
let initPromise: Promise<Database> | null = null

function isSchemaValid(db: Database): boolean {
  try {
    const result = db.exec("PRAGMA table_info(workspace_panels)")
    if (!result.length) return false
    const columns = result[0].values.map((row) => row[1] as string)
    if (!columns.includes('grid_x')) return false
    const wfResult = db.exec("PRAGMA table_info(workflows)")
    return wfResult.length > 0
  } catch {
    return false
  }
}

export async function initDb(): Promise<Database> {
  if (dbInstance) return dbInstance
  if (initPromise) return initPromise

  initPromise = (async () => {
    const SQL = await initSqlJs({
      locateFile: () => '/sql-wasm.wasm',
    })

    const saved = localStorage.getItem('pls-db')
    const savedVersion = localStorage.getItem('pls-db-version')
    let needsFreshDb = !saved || savedVersion !== String(SCHEMA_VERSION)

    if (saved && !needsFreshDb) {
      const buf = Uint8Array.from(atob(saved), (c) => c.charCodeAt(0))
      const candidate = new SQL.Database(buf)
      if (isSchemaValid(candidate)) {
        dbInstance = candidate
      } else {
        candidate.close()
        needsFreshDb = true
      }
    }

    if (needsFreshDb) {
      dbInstance = new SQL.Database()
      dbInstance.run(SCHEMA)
      seedDatabase(dbInstance)
      localStorage.setItem('pls-db-version', String(SCHEMA_VERSION))
      persistDb()
    }

    return dbInstance!
  })()

  return initPromise
}

export function getDb(): Database {
  if (!dbInstance) throw new Error('Database not initialized. Call initDb() first.')
  return dbInstance
}

export function persistDb(): void {
  if (!dbInstance) return
  const bytes = new Uint8Array(dbInstance.export())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  localStorage.setItem('pls-db', btoa(binary))
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
