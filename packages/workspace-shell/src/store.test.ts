import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lastBoardKey } from './lastBoard'

const USER = 'dev-user-1'

async function freshStore() {
  vi.resetModules()
  return (await import('./store')).useWorkspaceStore
}

describe('the chosen board and the device', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('starts on no board on a device that has never opened one', async () => {
    const store = await freshStore()
    expect(store.getState().activeWorkspaceId).toBeNull()
  })

  it('remembers the board the student chooses', async () => {
    const store = await freshStore()
    store.getState().setActiveWorkspaceId('ws-b')
    expect(localStorage.getItem(lastBoardKey(USER))).toBe('ws-b')
  })

  it('starts on the board last chosen on this device', async () => {
    localStorage.setItem(lastBoardKey(USER), 'ws-b')
    const store = await freshStore()
    expect(store.getState().activeWorkspaceId).toBe('ws-b')
  })

  it('forgets it when no board is open', async () => {
    const store = await freshStore()
    store.getState().setActiveWorkspaceId('ws-b')
    store.getState().setActiveWorkspaceId(null)
    expect(localStorage.getItem(lastBoardKey(USER))).toBeNull()
  })
})
