import { describe, expect, it } from 'vitest'
import { predictBoardScope, withBoardScope } from './board-scope'

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
