import { describe, expect, it } from 'vitest'
import { captionSides } from './block-captions'

const HOUR_PX = 40
const at = (h: number, m = 0) => h * 60 + m
const seg = (key: string, start: number, end: number, column = 0, columns = 1) => ({ key, startMin: start, endMin: end, column, columns })

describe('captionSides', () => {
  it('puts a short block\'s caption under it, and leaves tall blocks alone', () => {
    const sides = captionSides([seg('review', at(10), at(10, 20)), seg('lecture', at(12), at(13))], HOUR_PX)
    expect(sides.get('review')).toBe('below')
    expect(sides.get('lecture')).toBeNull()
  })

  it('never puts two captions in one lane on top of each other', () => {
    const sides = captionSides([
      seg('a', at(10), at(10, 20)),
      // Its under side is taken by the next block, and its over side by a's caption.
      seg('b', at(10, 45), at(11, 5)),
      seg('c', at(11, 10), at(12)),
    ], HOUR_PX)
    expect(sides.get('a')).toBe('below')
    expect(sides.get('b')).toBeNull()
  })

  it('lets captions in other lanes overlap in time', () => {
    const sides = captionSides([
      seg('a', at(10), at(10, 20), 0, 2),
      seg('b', at(10, 45), at(11, 5), 1, 2),
      seg('c', at(11, 10), at(12), 1, 2),
    ], HOUR_PX)
    expect(sides.get('a')).toBe('below')
    expect(sides.get('b')).toBe('above')
  })

  it('never puts a caption past the bottom of the grid', () => {
    const sides = captionSides([seg('late', at(23, 40), at(24))], HOUR_PX)
    expect(sides.get('late')).toBe('above')
  })
})
