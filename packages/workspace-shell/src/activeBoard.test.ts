import { describe, expect, it } from 'vitest'
import { resolveActiveBoard } from './activeBoard'

const boards = [{ id: 'ws-a' }, { id: 'ws-b' }, { id: 'ws-c' }]

describe('resolveActiveBoard', () => {
  it('opens no board while the boards load', () => {
    expect(resolveActiveBoard(undefined, 'ws-b')).toBeNull()
    expect(resolveActiveBoard(undefined, null)).toBeNull()
  })

  it('keeps the chosen board while the student has it', () => {
    expect(resolveActiveBoard(boards, 'ws-b')).toBe('ws-b')
  })

  it('opens the first board in tab order when none is chosen', () => {
    expect(resolveActiveBoard(boards, null)).toBe('ws-a')
  })

  it('opens the first board in tab order in place of one that is gone', () => {
    expect(resolveActiveBoard(boards, 'ws-deleted')).toBe('ws-a')
  })

  it('opens no board when the student has none', () => {
    expect(resolveActiveBoard([], 'ws-deleted')).toBeNull()
    expect(resolveActiveBoard([], null)).toBeNull()
  })
})
