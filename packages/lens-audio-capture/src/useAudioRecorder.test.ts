import { describe, expect, it } from 'vitest'
import { recordingTitle } from './useAudioRecorder'

describe('recordingTitle', () => {
  it('names a new capture in house style, not the browser locale', () => {
    expect(recordingTitle(new Date(2026, 9, 27, 0, 20, 44).getTime())).toBe('Lecture 27 Oct, 00:20')
  })
})
