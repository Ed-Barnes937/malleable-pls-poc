import { describe, it, expect } from 'vitest'
import { savedMessage } from './ReviewAutomationSentence'

describe('savedMessage', () => {
  it('says what happened to the reviews already made', () => {
    expect(savedMessage({ moved: 0, resized: 1, unscheduled: 0 }, 30)).toBe('Saved. Your review is now 30 min.')
    expect(savedMessage({ moved: 0, resized: 2, unscheduled: 0 }, 30)).toBe('Saved. 2 reviews are now 30 min.')
    expect(savedMessage({ moved: 1, resized: 1, unscheduled: 0 }, 30)).toBe('Saved. Moved 1 review to fit.')
    expect(savedMessage({ moved: 1, resized: 0, unscheduled: 1 }, 30)).toBe("Saved. 1 review no longer fits - it's on your to-do list.")
    expect(savedMessage({ moved: 0, resized: 0, unscheduled: 0 }, 30)).toBe('Saved. New reviews will follow this.')
  })
})
