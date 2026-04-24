import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import type { DatabaseConfig, StorageAdapter, SubstrateDatabase } from './types'

export type { DatabaseConfig, SubstrateDatabase } from './types'

const DEFAULT_STORAGE_KEY = 'pls-db'
const DEFAULT_SCHEMA_VERSION_KEY = 'pls-db-version'
const DEFAULT_WASM_LOCATOR = () => '/sql-wasm.wasm'

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function decodeBase64(encoded: string): Uint8Array {
  return Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
}

export async function createDatabase(config: DatabaseConfig): Promise<SubstrateDatabase> {
  const {
    storage,
    storageKey = DEFAULT_STORAGE_KEY,
    schemaVersionKey = DEFAULT_SCHEMA_VERSION_KEY,
    schemaVersion,
    schema,
    wasmLocator = DEFAULT_WASM_LOCATOR,
    seed,
    isSchemaValid,
  } = config

  const SQL = await initSqlJs({ locateFile: wasmLocator })

  let raw: SqlJsDatabase | null = null
  let closed = false

  const wrapper: SubstrateDatabase = {
    query<T>(sql: string, params: unknown[] = []): T[] {
      const db = requireRaw()
      const stmt = db.prepare(sql)
      stmt.bind(params)
      const results: T[] = []
      while (stmt.step()) {
        results.push(stmt.getAsObject() as T)
      }
      stmt.free()
      return results
    },
    exec(sql: string, params: unknown[] = []): void {
      const db = requireRaw()
      db.run(sql, params)
    },
    mutate<T>(fn: (db: SubstrateDatabase) => T): T {
      const result = fn(wrapper)
      wrapper.persist()
      return result
    },
    persist(): void {
      if (!raw || closed) return
      const bytes = new Uint8Array(raw.export())
      storage.write(storageKey, encodeBase64(bytes))
    },
    reset(): void {
      storage.remove(storageKey)
      storage.remove(schemaVersionKey)
      if (raw) {
        raw.close()
        raw = null
      }
      closed = true
    },
    close(): void {
      if (raw) {
        raw.close()
        raw = null
      }
      closed = true
    },
    isReady(): boolean {
      return raw !== null && !closed
    },
  }

  function requireRaw(): SqlJsDatabase {
    if (!raw || closed) throw new Error('Database is not ready')
    return raw
  }

  const saved = storage.read(storageKey)
  const savedVersion = storage.read(schemaVersionKey)
  let needsFresh = !saved || savedVersion !== String(schemaVersion)

  if (saved && !needsFresh) {
    const candidate = new SQL.Database(decodeBase64(saved))
    raw = candidate
    if (isSchemaValid && !isSchemaValid(wrapper)) {
      candidate.close()
      raw = null
      needsFresh = true
    }
  }

  if (needsFresh) {
    raw = new SQL.Database()
    raw.run(schema)
    if (seed) seed(wrapper)
    storage.write(schemaVersionKey, String(schemaVersion))
    wrapper.persist()
  }

  return wrapper
}
