import type { StorageAdapter } from './types'

export type { StorageAdapter } from './types'

export function createMemoryAdapter(): StorageAdapter {
  const store = new Map<string, string>()
  return {
    read(key) {
      return store.has(key) ? (store.get(key) as string) : null
    },
    write(key, value) {
      store.set(key, value)
    },
    remove(key) {
      store.delete(key)
    },
  }
}

export function createLocalStorageAdapter(): StorageAdapter {
  return {
    read(key) {
      return localStorage.getItem(key)
    },
    write(key, value) {
      localStorage.setItem(key, value)
    },
    remove(key) {
      localStorage.removeItem(key)
    },
  }
}
