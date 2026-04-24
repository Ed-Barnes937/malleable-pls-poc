export interface StorageAdapter {
  read(key: string): string | null
  write(key: string, value: string): void
  remove(key: string): void
}

export interface SubstrateDatabase {
  query<T>(sql: string, params?: unknown[]): T[]
  exec(sql: string, params?: unknown[]): void
  mutate<T>(fn: (db: SubstrateDatabase) => T): T
  persist(): void
  reset(): void
  close(): void
  isReady(): boolean
}

export interface DatabaseConfig {
  storage: StorageAdapter
  storageKey?: string
  schemaVersionKey?: string
  schemaVersion: number
  schema: string
  wasmLocator?: () => string
  seed?: (db: SubstrateDatabase) => void
  isSchemaValid?: (db: SubstrateDatabase) => boolean
}
