import { describe, expect, it } from 'vitest'
import { MINUTE_MS, normalize, subtract, totalMinutes } from './intervals'

const iv = (start: number, end: number) => ({ start, end })

describe('normalize', () => {
  it('drops empty, inverted and NaN intervals', () => {
    expect(normalize([iv(5, 5), iv(9, 3), iv(NaN, 4), iv(1, NaN)])).toEqual([])
  })

  it('sorts and merges overlapping and touching intervals', () => {
    expect(normalize([iv(10, 20), iv(0, 5), iv(5, 7), iv(15, 30), iv(40, 50)])).toEqual([
      iv(0, 7),
      iv(10, 30),
      iv(40, 50),
    ])
  })

  it('keeps an interval contained in another merged into the outer one', () => {
    expect(normalize([iv(0, 100), iv(10, 20)])).toEqual([iv(0, 100)])
  })

  it('strips extra fields and does not mutate the input', () => {
    const input = [{ start: 1, end: 2, taskId: 'a' }]
    expect(normalize(input)).toEqual([iv(1, 2)])
    expect(input[0]).toEqual({ start: 1, end: 2, taskId: 'a' })
  })
})

describe('subtract', () => {
  it('returns the source unchanged when nothing overlaps', () => {
    expect(subtract([iv(0, 10)], [iv(20, 30)])).toEqual([iv(0, 10)])
    expect(subtract([iv(0, 10)], [])).toEqual([iv(0, 10)])
  })

  it('cuts partial overlaps at either end', () => {
    expect(subtract([iv(0, 10)], [iv(-5, 3), iv(8, 15)])).toEqual([iv(3, 8)])
  })

  it('splits around a contained interval', () => {
    expect(subtract([iv(0, 10)], [iv(4, 6)])).toEqual([iv(0, 4), iv(6, 10)])
  })

  it('removes a fully covered interval', () => {
    expect(subtract([iv(2, 4)], [iv(0, 10)])).toEqual([])
  })

  it('handles a removal spanning several source intervals', () => {
    expect(subtract([iv(0, 10), iv(20, 30), iv(40, 50)], [iv(5, 45)])).toEqual([
      iv(0, 5),
      iv(45, 50),
    ])
  })

  it('handles many removals inside one source interval and unsorted input', () => {
    expect(subtract([iv(0, 100)], [iv(70, 80), iv(10, 20), iv(40, 50)])).toEqual([
      iv(0, 10),
      iv(20, 40),
      iv(50, 70),
      iv(80, 100),
    ])
  })

  it('skips removals that end before later source intervals', () => {
    expect(subtract([iv(0, 10), iv(20, 30)], [iv(1, 2), iv(3, 4), iv(25, 26)])).toEqual([
      iv(0, 1),
      iv(2, 3),
      iv(4, 10),
      iv(20, 25),
      iv(26, 30),
    ])
  })
})

describe('totalMinutes', () => {
  it('sums merged lengths and rounds down', () => {
    expect(totalMinutes([iv(0, 30 * MINUTE_MS), iv(10 * MINUTE_MS, 40 * MINUTE_MS + 59_999)])).toBe(
      40,
    )
    expect(totalMinutes([])).toBe(0)
  })
})
