import { describe, expect, it } from 'vitest'
import type { Resource } from '@pls/substrate'
import { editedAgo, groupResources } from './grouping'

const resource = (id: string, fields: Partial<Resource> = {}): Resource => ({
  id,
  kind: 'note',
  title: id,
  url: null,
  provider: null,
  file_name: null,
  mime_type: null,
  size_bytes: null,
  lecture_id: null,
  course: null,
  lecture_title: null,
  lecture_course: null,
  excerpt: '',
  created_at: '2026-10-30T10:00:00Z',
  updated_at: '2026-10-30T10:00:00Z',
  ...fields,
})

const ids = (rows: Resource[] | null) => rows?.map((r) => r.id) ?? null

describe('groupResources', () => {
  const list = [
    resource('course-1', { course: 'biology' }),
    resource('cells-1', { lecture_id: 'cells', lecture_title: 'Cells', lecture_course: 'biology' }),
    resource('enzymes-1', { lecture_id: 'enzymes', lecture_title: 'Enzymes', lecture_course: 'biology' }),
    resource('cells-2', { lecture_id: 'cells', lecture_title: 'Cells', lecture_course: 'biology' }),
    resource('course-2', { course: 'biology' }),
  ]

  it('without a lecture: course resources, then each lecture with its own', () => {
    const sections = groupResources(list, undefined)
    expect(sections.lecture).toBeNull()
    expect(ids(sections.course)).toEqual(['course-1', 'course-2'])
    expect(sections.otherLectures.map((g) => [g.lectureId, g.title, ids(g.resources)])).toEqual([
      ['cells', 'Cells', ['cells-1', 'cells-2']],
      ['enzymes', 'Enzymes', ['enzymes-1']],
    ])
  })

  it('with a lecture: its resources, the course, then the other lectures', () => {
    const sections = groupResources(list, 'cells')
    expect(ids(sections.lecture)).toEqual(['cells-1', 'cells-2'])
    expect(ids(sections.course)).toEqual(['course-1', 'course-2'])
    expect(sections.otherLectures.map((g) => g.lectureId)).toEqual(['enzymes'])
  })

  it('a lecture with nothing yet is an empty section, not a missing one', () => {
    expect(groupResources(list, 'new-lecture').lecture).toEqual([])
  })

  it('keeps unfiled resources with the course ones (an "All courses" board)', () => {
    const sections = groupResources([resource('loose'), resource('chem', { course: 'chemistry' })], undefined)
    expect(ids(sections.course)).toEqual(['loose', 'chem'])
  })
})

describe('editedAgo', () => {
  const now = new Date('2026-10-30T12:00:00Z').getTime()
  it.each([
    ['2026-10-30T11:59:40Z', 'just now'],
    ['2026-10-30T11:55:00Z', '5m ago'],
    ['2026-10-30T10:00:00Z', '2h ago'],
    ['2026-10-28T12:00:00Z', '2d ago'],
  ])('%s is %s', (at, label) => {
    expect(editedAgo(at, now)).toBe(label)
  })
})
