import { describe, it, expect } from 'vitest'
import {
  COURSE_COLORS,
  STARTER_COURSES,
  courseInUseMessage,
  courseNameInput,
  courseNameKey,
  duplicateCourseMessage,
  nextCourseColor,
  sortCourses,
  type CourseColor,
} from './courses'

const active = (...colors: CourseColor[]) => colors.map((color) => ({ color, archived_at: null }))

describe('course palette', () => {
  it('has eight colours, the starters taking the first three in today\'s order', () => {
    expect(COURSE_COLORS).toEqual(['green', 'blue', 'purple', 'amber', 'rose', 'teal', 'orange', 'slate'])
    expect(STARTER_COURSES.map((c) => [c.id, c.name, c.color])).toEqual([
      ['biology', 'Biology', 'green'], ['chemistry', 'Chemistry', 'blue'], ['physics', 'Physics', 'purple'],
    ])
  })

  it('gives a new course the colour the active ones use least, palette order breaking ties', () => {
    expect(nextCourseColor([])).toBe('green')
    expect(nextCourseColor(active('green', 'blue', 'purple'))).toBe('amber')
    expect(nextCourseColor(active(...COURSE_COLORS))).toBe('green')
    expect(nextCourseColor(active(...COURSE_COLORS, 'green', 'blue'))).toBe('purple')
    // Out of order: the first unused in palette order.
    expect(nextCourseColor(active('amber', 'green'))).toBe('blue')
  })

  it('frees an archived course\'s colour', () => {
    expect(nextCourseColor([...active('green'), { color: 'blue', archived_at: '2026-11-01T00:00:00Z' }])).toBe('blue')
  })
})

describe('course names', () => {
  it('are trimmed, 1 to 60 characters', () => {
    expect(courseNameInput.parse('  History  ')).toBe('History')
    expect(courseNameInput.safeParse('   ').success).toBe(false)
    expect(courseNameInput.safeParse('x'.repeat(60)).success).toBe(true)
    expect(courseNameInput.safeParse('x'.repeat(61)).success).toBe(false)
  })

  it('collide whatever the case and surrounding spaces', () => {
    expect(courseNameKey(' Biology ')).toBe(courseNameKey('BIOLOGY'))
  })

  it('say which course a duplicate is, archived or not', () => {
    expect(duplicateCourseMessage({ name: 'History', archived_at: null })).toBe('You already have a course called History')
    expect(duplicateCourseMessage({ name: 'History', archived_at: '2026-11-01T00:00:00Z' })).toBe('You have an archived course called History')
  })

  it('sort by name, case-insensitively, then id', () => {
    const sorted = sortCourses([{ id: 'b', name: 'maths' }, { id: 'a', name: 'Art' }, { id: 'c', name: 'Maths' }, { id: 'z', name: 'biology' }])
    expect(sorted.map((c) => c.id)).toEqual(['a', 'z', 'b', 'c'])
  })
})

describe('courseInUseMessage', () => {
  it('names what still uses the course', () => {
    expect(courseInUseMessage('Biology', { lectures: 2, resources: 0, planItems: 0 })).toBe('Biology is still used by 2 lectures: archive it instead')
    expect(courseInUseMessage('Biology', { lectures: 1, resources: 1, planItems: 3 }))
      .toBe('Biology is still used by 1 lecture, 1 resource and 3 plan items: archive it instead')
    expect(courseInUseMessage('Art', { lectures: 0, resources: 2, planItems: 1 })).toBe('Art is still used by 2 resources and 1 plan item: archive it instead')
  })
})
