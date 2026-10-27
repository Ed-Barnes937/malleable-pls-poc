import { describe, it, expect } from 'vitest'
import type { PanelManifest } from '@pls/lens-framework'
import { BOARD_STARTERS, listNames, starterWidgets } from './starters'

const manifest = (id: string, label: string) => ({ id, label }) as unknown as PanelManifest

describe('starterWidgets', () => {
  it("keeps the starter's order and skips widgets that aren't registered", () => {
    const plan = BOARD_STARTERS.find((s) => s.id === 'plan')!
    const manifests = [manifest('coming-up', 'Coming up'), manifest('calendar', 'Calendar')]
    expect(starterWidgets(plan, manifests).map((m) => m.id)).toEqual(['calendar', 'coming-up'])
  })
})

describe('listNames', () => {
  it('joins names the way a person would say them', () => {
    expect(listNames([])).toBe('')
    expect(listNames(['Calendar'])).toBe('Calendar')
    expect(listNames(['Audio Capture', 'Transcript'])).toBe('Audio Capture and Transcript')
    expect(listNames(['Calendar', 'To-do', 'Coming up'])).toBe('Calendar, To-do and Coming up')
  })
})
