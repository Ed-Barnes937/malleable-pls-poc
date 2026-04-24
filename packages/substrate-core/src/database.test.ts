import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { createDatabase, type SubstrateDatabase } from './database'
import { createMemoryAdapter, type StorageAdapter } from './storage-adapters'
import type { DatabaseConfig } from './types'

const require = createRequire(import.meta.url)
const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
const wasmLocator = () => wasmPath

const TEST_SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL
);
`

interface Item {
  id: string
  name: string
  value: number
}

function makeConfig(
  storage: StorageAdapter,
  overrides: Partial<DatabaseConfig> = {},
): DatabaseConfig {
  return {
    storage,
    schemaVersion: 1,
    schema: TEST_SCHEMA,
    wasmLocator,
    ...overrides,
  }
}

describe('createDatabase', () => {
  let storage: StorageAdapter
  let db: SubstrateDatabase | null = null

  beforeEach(() => {
    storage = createMemoryAdapter()
  })

  afterEach(() => {
    if (db) {
      db.close()
      db = null
    }
  })

  it('creates a fresh DB when storage is empty', async () => {
    db = await createDatabase(makeConfig(storage))
    expect(db.isReady()).toBe(true)
  })

  it('runs schema SQL on fresh DB so tables exist', async () => {
    db = await createDatabase(makeConfig(storage))
    const rows = db.query<Item>('SELECT * FROM items')
    expect(rows).toEqual([])
  })

  it('calls seed function on fresh DB', async () => {
    const seed = vi.fn((database: SubstrateDatabase) => {
      database.exec("INSERT INTO items (id, name, value) VALUES ('a', 'Alpha', 1)")
    })
    db = await createDatabase(makeConfig(storage, { seed }))
    expect(seed).toHaveBeenCalledTimes(1)
    const rows = db.query<Item>('SELECT * FROM items')
    expect(rows).toEqual([{ id: 'a', name: 'Alpha', value: 1 }])
  })

  it('persists to storage after creation (fresh DB)', async () => {
    db = await createDatabase(
      makeConfig(storage, {
        storageKey: 'my-db',
        schemaVersion: 2,
        schemaVersionKey: 'my-db-version',
      }),
    )
    expect(storage.read('my-db')).not.toBeNull()
    expect(storage.read('my-db-version')).toBe('2')
  })

  it('query returns typed rows with column keys', async () => {
    db = await createDatabase(makeConfig(storage))
    db.exec("INSERT INTO items (id, name, value) VALUES ('a', 'Alpha', 1)")
    db.exec("INSERT INTO items (id, name, value) VALUES ('b', 'Beta', 2)")
    const rows = db.query<Item>('SELECT * FROM items ORDER BY id')
    expect(rows).toEqual([
      { id: 'a', name: 'Alpha', value: 1 },
      { id: 'b', name: 'Beta', value: 2 },
    ])
  })

  it('query with params filters correctly', async () => {
    db = await createDatabase(makeConfig(storage))
    db.exec("INSERT INTO items (id, name, value) VALUES ('a', 'Alpha', 1)")
    db.exec("INSERT INTO items (id, name, value) VALUES ('b', 'Beta', 2)")
    const rows = db.query<Item>('SELECT * FROM items WHERE value > ?', [1])
    expect(rows).toEqual([{ id: 'b', name: 'Beta', value: 2 }])
  })

  it('exec with params inserts data that can be queried back', async () => {
    db = await createDatabase(makeConfig(storage))
    db.exec('INSERT INTO items (id, name, value) VALUES (?, ?, ?)', ['x', 'X-Name', 7])
    const rows = db.query<Item>('SELECT * FROM items WHERE id = ?', ['x'])
    expect(rows).toEqual([{ id: 'x', name: 'X-Name', value: 7 }])
  })

  it('mutate executes the function and auto-persists', async () => {
    db = await createDatabase(makeConfig(storage, { storageKey: 'db-k' }))
    const beforeSnap = storage.read('db-k')
    db.mutate((inner) => {
      inner.exec("INSERT INTO items (id, name, value) VALUES ('m', 'M', 10)")
    })
    const afterSnap = storage.read('db-k')
    expect(afterSnap).not.toBe(beforeSnap)
    const rows = db.query<Item>('SELECT * FROM items')
    expect(rows).toHaveLength(1)
  })

  it('mutate returns the function result', async () => {
    db = await createDatabase(makeConfig(storage))
    const result = db.mutate(() => 42)
    expect(result).toBe(42)
  })

  it('mutate persists only once even with multiple writes inside', async () => {
    db = await createDatabase(makeConfig(storage, { storageKey: 'db-once' }))
    const spy = vi.spyOn(storage, 'write')
    spy.mockClear()
    db.mutate((inner) => {
      inner.exec("INSERT INTO items (id, name, value) VALUES ('1', 'A', 1)")
      inner.exec("INSERT INTO items (id, name, value) VALUES ('2', 'B', 2)")
      inner.exec("INSERT INTO items (id, name, value) VALUES ('3', 'C', 3)")
    })
    const dbWrites = spy.mock.calls.filter((c) => c[0] === 'db-once')
    expect(dbWrites).toHaveLength(1)
  })

  it('persist serializes DB to storage', async () => {
    db = await createDatabase(makeConfig(storage, { storageKey: 'persist-k' }))
    db.exec("INSERT INTO items (id, name, value) VALUES ('p', 'P', 0)")
    const before = storage.read('persist-k')
    db.persist()
    const after = storage.read('persist-k')
    expect(after).not.toBeNull()
    expect(after).not.toBe(before)
  })

  it('reset clears storage and closes DB', async () => {
    db = await createDatabase(
      makeConfig(storage, { storageKey: 'reset-k', schemaVersionKey: 'reset-k-v' }),
    )
    expect(storage.read('reset-k')).not.toBeNull()
    db.reset()
    expect(storage.read('reset-k')).toBeNull()
    expect(db.isReady()).toBe(false)
    db = null
  })

  it('createDatabase restores from storage when data exists', async () => {
    const first = await createDatabase(
      makeConfig(storage, { storageKey: 'shared', schemaVersionKey: 'shared-v' }),
    )
    first.exec("INSERT INTO items (id, name, value) VALUES ('keep', 'Kept', 99)")
    first.persist()
    first.close()

    db = await createDatabase(
      makeConfig(storage, { storageKey: 'shared', schemaVersionKey: 'shared-v' }),
    )
    const rows = db.query<Item>('SELECT * FROM items')
    expect(rows).toEqual([{ id: 'keep', name: 'Kept', value: 99 }])
  })

  it('createDatabase resets if schema version changed', async () => {
    const first = await createDatabase(
      makeConfig(storage, {
        storageKey: 'vbump',
        schemaVersionKey: 'vbump-v',
        schemaVersion: 1,
      }),
    )
    first.exec("INSERT INTO items (id, name, value) VALUES ('old', 'Old', 1)")
    first.persist()
    first.close()

    const seed = vi.fn()
    db = await createDatabase(
      makeConfig(storage, {
        storageKey: 'vbump',
        schemaVersionKey: 'vbump-v',
        schemaVersion: 2,
        seed,
      }),
    )
    const rows = db.query<Item>('SELECT * FROM items')
    expect(rows).toEqual([])
    expect(seed).toHaveBeenCalledTimes(1)
    expect(storage.read('vbump-v')).toBe('2')
  })

  it('createDatabase resets if isSchemaValid returns false', async () => {
    const first = await createDatabase(
      makeConfig(storage, { storageKey: 'inv', schemaVersionKey: 'inv-v' }),
    )
    first.exec("INSERT INTO items (id, name, value) VALUES ('x', 'X', 1)")
    first.persist()
    first.close()

    const seed = vi.fn()
    db = await createDatabase(
      makeConfig(storage, {
        storageKey: 'inv',
        schemaVersionKey: 'inv-v',
        seed,
        isSchemaValid: () => false,
      }),
    )
    const rows = db.query<Item>('SELECT * FROM items')
    expect(rows).toEqual([])
    expect(seed).toHaveBeenCalledTimes(1)
  })

  it('createDatabase keeps data when isSchemaValid returns true', async () => {
    const first = await createDatabase(
      makeConfig(storage, { storageKey: 'keep', schemaVersionKey: 'keep-v' }),
    )
    first.exec("INSERT INTO items (id, name, value) VALUES ('ok', 'OK', 5)")
    first.persist()
    first.close()

    const seed = vi.fn()
    db = await createDatabase(
      makeConfig(storage, {
        storageKey: 'keep',
        schemaVersionKey: 'keep-v',
        seed,
        isSchemaValid: () => true,
      }),
    )
    const rows = db.query<Item>('SELECT * FROM items')
    expect(rows).toEqual([{ id: 'ok', name: 'OK', value: 5 }])
    expect(seed).not.toHaveBeenCalled()
  })
})
