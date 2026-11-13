import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { Course } from '@pls/substrate'
import { COURSE_TONES, NEUTRAL_TONE, courseTone } from './constants'
import { CourseOptions, CoursesProvider, courseLabel, useCourse } from './courses'

const COURSES: Course[] = [
  { id: 'biology', name: 'Biology', color: 'green', archived_at: null },
  { id: '5f0c4a2e-uuid', name: 'History', color: 'amber', archived_at: '2026-11-01T00:00:00Z' },
  { id: 'chemistry', name: 'Chemistry', color: 'blue', archived_at: null },
]

function Show({ id }: { id: string | null }) {
  const course = useCourse(id)
  return <p data-testid="course">{course ? `${course.name} ${course.tone.stripe}${course.archived ? ' archived' : ''}` : 'none'}</p>
}

describe('courseTone', () => {
  it('has a tone per palette colour, and a neutral one for none', () => {
    expect(courseTone('green')).toBe(COURSE_TONES.green)
    expect(courseTone('slate').stripe).toBe('bg-course-slate')
    expect(courseTone(null)).toBe(NEUTRAL_TONE)
    expect(courseTone(undefined)).toBe(NEUTRAL_TONE)
  })
})

describe('course lookup', () => {
  it('finds a course by id with its name, tone and archived state', () => {
    render(<CoursesProvider courses={COURSES}><Show id="5f0c4a2e-uuid" /></CoursesProvider>)
    expect(screen.getByTestId('course')).toHaveTextContent('History bg-course-amber archived')
  })

  it('finds nothing for no course, an unknown id, or before the courses load: never shows the id', () => {
    const { rerender } = render(<CoursesProvider courses={COURSES}><Show id={null} /></CoursesProvider>)
    expect(screen.getByTestId('course')).toHaveTextContent('none')
    rerender(<CoursesProvider courses={COURSES}><Show id="physics" /></CoursesProvider>)
    expect(screen.getByTestId('course')).toHaveTextContent('none')
    rerender(<CoursesProvider courses={undefined}><Show id="biology" /></CoursesProvider>)
    expect(screen.getByTestId('course')).toHaveTextContent('none')
  })

  it('takes a rename on the next list', () => {
    const { rerender } = render(<CoursesProvider courses={COURSES}><Show id="biology" /></CoursesProvider>)
    rerender(<CoursesProvider courses={[{ ...COURSES[0], name: 'Cell Biology', color: 'teal' }]}><Show id="biology" /></CoursesProvider>)
    expect(screen.getByTestId('course')).toHaveTextContent('Cell Biology bg-course-teal')
  })

  it('labels an archived course as such', () => {
    expect(courseLabel({ name: 'History', archived: true })).toBe('History (archived)')
    expect(courseLabel({ name: 'Biology', archived: false })).toBe('Biology')
  })
})

describe('CourseOptions', () => {
  const options = () => screen.getAllByRole('option').map((o) => [(o as HTMLOptionElement).value, o.textContent])

  it('offers the active courses, in the order given', () => {
    render(<CoursesProvider courses={COURSES}><select aria-label="Course"><CourseOptions /></select></CoursesProvider>)
    expect(options()).toEqual([['biology', 'Biology'], ['chemistry', 'Chemistry']])
  })

  it('keeps an archived course a picker already shows', () => {
    render(<CoursesProvider courses={COURSES}><select aria-label="Course"><CourseOptions current="5f0c4a2e-uuid" /></select></CoursesProvider>)
    expect(options()).toEqual([['5f0c4a2e-uuid', 'History (archived)'], ['biology', 'Biology'], ['chemistry', 'Chemistry']])
  })

  it('offers nothing to a student with no courses', () => {
    render(<CoursesProvider courses={[]}><select aria-label="Course"><option value="">No course</option><CourseOptions /></select></CoursesProvider>)
    expect(options()).toEqual([['', 'No course']])
  })
})
