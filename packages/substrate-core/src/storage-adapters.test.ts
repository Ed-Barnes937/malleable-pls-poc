import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMemoryAdapter, createLocalStorageAdapter } from './storage-adapters'

describe('createMemoryAdapter', () => {
  it('read returns null for missing key', () => {
    const adapter = createMemoryAdapter()
    expect(adapter.read('missing')).toBeNull()
  })

  it('write + read round-trips a value', () => {
    const adapter = createMemoryAdapter()
    adapter.write('k', 'v')
    expect(adapter.read('k')).toBe('v')
  })

  it('write overwrites an existing value', () => {
    const adapter = createMemoryAdapter()
    adapter.write('k', 'v1')
    adapter.write('k', 'v2')
    expect(adapter.read('k')).toBe('v2')
  })

  it('remove deletes the key', () => {
    const adapter = createMemoryAdapter()
    adapter.write('k', 'v')
    adapter.remove('k')
    expect(adapter.read('k')).toBeNull()
  })

  it('remove on a missing key is a no-op', () => {
    const adapter = createMemoryAdapter()
    expect(() => adapter.remove('missing')).not.toThrow()
  })

  it('each adapter has independent state', () => {
    const a = createMemoryAdapter()
    const b = createMemoryAdapter()
    a.write('k', 'a')
    b.write('k', 'b')
    expect(a.read('k')).toBe('a')
    expect(b.read('k')).toBe('b')
  })
})

describe('createLocalStorageAdapter', () => {
  const mockStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', mockStorage)
    mockStorage.getItem.mockReset()
    mockStorage.setItem.mockReset()
    mockStorage.removeItem.mockReset()
  })

  it('read delegates to localStorage.getItem', () => {
    mockStorage.getItem.mockReturnValue('value')
    const adapter = createLocalStorageAdapter()
    expect(adapter.read('key')).toBe('value')
    expect(mockStorage.getItem).toHaveBeenCalledWith('key')
  })

  it('read returns null when localStorage returns null', () => {
    mockStorage.getItem.mockReturnValue(null)
    const adapter = createLocalStorageAdapter()
    expect(adapter.read('missing')).toBeNull()
  })

  it('write delegates to localStorage.setItem', () => {
    const adapter = createLocalStorageAdapter()
    adapter.write('key', 'value')
    expect(mockStorage.setItem).toHaveBeenCalledWith('key', 'value')
  })

  it('remove delegates to localStorage.removeItem', () => {
    const adapter = createLocalStorageAdapter()
    adapter.remove('key')
    expect(mockStorage.removeItem).toHaveBeenCalledWith('key')
  })
})
