import { describe, expect, it } from 'vitest'
import { lastBoardKey, readLastBoard, writeLastBoard } from './lastBoard'
import { resolveActiveBoard } from './activeBoard'

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k) },
    setItem: (k, v) => { data.set(k, String(v)) },
  }
}

const throwing = new Proxy({} as Storage, {
  get() { throw new Error('storage blocked') },
})

describe('last open board, per device and per user', () => {
  it('reads back the board last written', () => {
    const storage = fakeStorage()
    writeLastBoard('ws-b', 'alice', storage)
    expect(readLastBoard('alice', storage)).toBe('ws-b')
  })

  it('keeps each user on their own board', () => {
    const storage = fakeStorage()
    writeLastBoard('ws-a', 'alice', storage)
    writeLastBoard('ws-b', 'bob', storage)
    expect(readLastBoard('alice', storage)).toBe('ws-a')
    expect(readLastBoard('bob', storage)).toBe('ws-b')
    expect(lastBoardKey('alice')).not.toBe(lastBoardKey('bob'))
  })

  it('reads nothing before a board was ever opened', () => {
    expect(readLastBoard('alice', fakeStorage())).toBeNull()
  })

  it('forgets the board when none is open', () => {
    const storage = fakeStorage()
    writeLastBoard('ws-a', 'alice', storage)
    writeLastBoard(null, 'alice', storage)
    expect(readLastBoard('alice', storage)).toBeNull()
    expect(storage.length).toBe(0)
  })

  it('treats an empty stored value as no board', () => {
    expect(readLastBoard('alice', fakeStorage({ [lastBoardKey('alice')]: '' }))).toBeNull()
  })

  it('copes with storage that is blocked', () => {
    expect(readLastBoard('alice', throwing)).toBeNull()
    expect(() => writeLastBoard('ws-a', 'alice', throwing)).not.toThrow()
    expect(() => writeLastBoard(null, 'alice', throwing)).not.toThrow()
  })

  it('falls back to the default board when the remembered one is gone', () => {
    const storage = fakeStorage()
    writeLastBoard('ws-deleted', 'alice', storage)
    const boards = [{ id: 'ws-a' }, { id: 'ws-b' }]
    expect(resolveActiveBoard(boards, readLastBoard('alice', storage))).toBe('ws-a')
  })

  it('reopens the remembered board while the student still has it', () => {
    const storage = fakeStorage()
    writeLastBoard('ws-b', 'alice', storage)
    const boards = [{ id: 'ws-a' }, { id: 'ws-b' }]
    expect(resolveActiveBoard(boards, readLastBoard('alice', storage))).toBe('ws-b')
  })
})
