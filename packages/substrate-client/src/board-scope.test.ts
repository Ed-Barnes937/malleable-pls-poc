import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { applyBoardScopePatches, predictBoardScope, withBoardScope } from './board-scope'
import { cachedLectureCourse } from './shell-hooks'

const COURSES: Record<string, string | null> = { 'bio-1': 'biology', 'bio-2': 'biology', 'chem-1': 'chemistry', 'unfiled-1': null }
const courseOf = (id: string) => COURSES[id]

describe('predictBoardScope', () => {
  const bioLecture = { courseTag: 'biology', lectureId: 'bio-1' }

  it('a lecture brings its course (I1)', () => {
    expect(predictBoardScope({ courseTag: null, lectureId: null }, { lectureId: 'chem-1' }, courseOf))
      .toEqual({ courseTag: 'chemistry', lectureId: 'chem-1' })
    expect(predictBoardScope(bioLecture, { lectureId: 'unfiled-1' }, courseOf))
      .toEqual({ courseTag: null, lectureId: 'unfiled-1' })
  })

  it("leaves the course alone for a lecture it doesn't know", () => {
    expect(predictBoardScope(bioLecture, { lectureId: 'unknown' }, courseOf))
      .toEqual({ courseTag: 'biology', lectureId: 'unknown' })
  })

  it('another course clears the lecture (I2), "All courses" too', () => {
    expect(predictBoardScope(bioLecture, { courseTag: 'chemistry' }, courseOf)).toEqual({ courseTag: 'chemistry', lectureId: null })
    expect(predictBoardScope(bioLecture, { courseTag: null }, courseOf)).toEqual({ courseTag: null, lectureId: null })
  })

  it('the same course keeps the lecture', () => {
    expect(predictBoardScope(bioLecture, { courseTag: 'biology' }, courseOf)).toEqual(bioLecture)
  })

  it('clearing the lecture keeps the course', () => {
    expect(predictBoardScope(bioLecture, { lectureId: null }, courseOf)).toEqual({ courseTag: 'biology', lectureId: null })
  })

  it('a course on a board with no lecture just sets it', () => {
    expect(predictBoardScope({ courseTag: null, lectureId: null }, { courseTag: 'physics' }, courseOf))
      .toEqual({ courseTag: 'physics', lectureId: null })
  })
})

describe('withBoardScope', () => {
  const rows = [
    { id: 'r-lecture', workspace_id: 'ws', scope_type: 'lecture', scope_value: 'bio-1' },
    { id: 'r-tag', workspace_id: 'ws', scope_type: 'tag', scope_value: 'biology' },
  ]

  it('replaces the values and keeps the row ids', () => {
    expect(withBoardScope(rows, 'ws', { courseTag: 'chemistry', lectureId: 'chem-1' })).toEqual([
      { id: 'r-lecture', workspace_id: 'ws', scope_type: 'lecture', scope_value: 'chem-1' },
      { id: 'r-tag', workspace_id: 'ws', scope_type: 'tag', scope_value: 'chemistry' },
    ])
  })

  it('drops cleared dimensions and adds new ones, ordered by type', () => {
    expect(withBoardScope([rows[1]], 'ws', { courseTag: null, lectureId: 'unfiled-1' })).toEqual([
      { id: 'optimistic-lecture', workspace_id: 'ws', scope_type: 'lecture', scope_value: 'unfiled-1' },
    ])
    expect(withBoardScope([], 'ws', { courseTag: 'biology', lectureId: 'bio-1' }).map((r) => r.scope_type)).toEqual(['lecture', 'tag'])
  })

  it('keeps rows of other types', () => {
    const other = { id: 'r-x', workspace_id: 'ws', scope_type: 'x', scope_value: 'y' }
    expect(withBoardScope([other, ...rows], 'ws', { courseTag: null, lectureId: null })).toEqual([other])
  })
})

describe('applyBoardScopePatches', () => {
  it('applies unanswered writes in order over the confirmed scope', () => {
    const base = { courseTag: 'biology', lectureId: 'bio-1' }
    expect(applyBoardScopePatches(base, [], courseOf)).toEqual(base)
    // Chemistry clears the lecture, then a Chemistry lecture is chosen.
    expect(applyBoardScopePatches(base, [{ courseTag: 'chemistry' }, { lectureId: 'chem-1' }], courseOf))
      .toEqual({ courseTag: 'chemistry', lectureId: 'chem-1' })
    // The other way round: the lecture brings Chemistry, then Biology clears it.
    expect(applyBoardScopePatches(base, [{ lectureId: 'chem-1' }, { courseTag: 'biology' }], courseOf))
      .toEqual({ courseTag: 'biology', lectureId: null })
  })
})

describe('cachedLectureCourse', () => {
  // tRPC query keys: [path, { input, type }].
  const key = (path: string[], input: unknown) => [path, { input, type: 'query' }]

  it('reads a cached lecture, from a list or by id', () => {
    const client = new QueryClient()
    client.setQueryData(key(['lectures', 'list'], undefined), [{ id: 'chem-1', course: 'chemistry' }])
    client.setQueryData(key(['lectures', 'byId'], 'unfiled-1'), { id: 'unfiled-1', course: null })
    expect(cachedLectureCourse(client, 'chem-1')).toBe('chemistry')
    expect(cachedLectureCourse(client, 'unfiled-1')).toBeNull()
    expect(cachedLectureCourse(client, 'other')).toBeUndefined()
  })

  it("else a cached recording of it (opening a moment fetches the moment's recording first)", () => {
    const client = new QueryClient()
    client.setQueryData(key(['recordings', 'byId'], 'rec-chem-1'), { id: 'rec-chem-1', lecture_id: 'chem-1', course: 'chemistry' })
    client.setQueryData(key(['recordings', 'byId'], 'rec-unfiled'), { id: 'rec-unfiled', lecture_id: 'unfiled-1', course: null })
    // A list row has no lecture course: never read.
    client.setQueryData(key(['recordings', 'list'], undefined), [{ id: 'rec-bio-1', lecture_id: 'bio-1', course: 'wrong' }])
    expect(cachedLectureCourse(client, 'chem-1')).toBe('chemistry')
    expect(cachedLectureCourse(client, 'unfiled-1')).toBeNull()
    expect(cachedLectureCourse(client, 'bio-1')).toBeUndefined()
  })
})
