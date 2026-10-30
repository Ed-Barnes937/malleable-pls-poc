import { useState } from 'react'
import { useSubstrate } from '@pls/lens-framework'
import { COURSES, Dialog, Select } from '@pls/shared-ui'
import type { Resource } from '@pls/substrate'

/** Where a resource can go: a lecture, a course, or nowhere (unfiled). */
export type Destination = { lectureId: string } | { courseTag: string } | 'unfiled'

function encode(resource: Resource): string {
  if (resource.lecture_id) return `lecture:${resource.lecture_id}`
  if (resource.course) return `course:${resource.course}`
  return 'unfiled'
}

function decode(value: string): Destination {
  if (value.startsWith('lecture:')) return { lectureId: value.slice('lecture:'.length) }
  if (value.startsWith('course:')) return { courseTag: value.slice('course:'.length) }
  return 'unfiled'
}

export interface MoveDialogProps {
  resource: Resource
  onMove: (to: Destination) => void
  onClose: () => void
}

/** "Move to lecture / course": every course, and each course's lectures. */
export function MoveDialog({ resource, onMove, onClose }: MoveDialogProps) {
  const { data: lectures } = useSubstrate().useLectures()
  const [value, setValue] = useState(encode(resource))
  const lecturesIn = (course: string | null) => (lectures ?? []).filter((l) => l.course === course)
  const unfiledLectures = lecturesIn(null)

  return (
    <Dialog open onClose={onClose} title={`Move ${resource.title}`} className="w-full">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (value !== encode(resource)) onMove(decode(value))
          onClose()
        }}
      >
        <Select aria-label="Move to" value={value} onChange={(e) => setValue(e.target.value)}>
          {COURSES.map((course) => (
            <optgroup key={course.value} label={course.label}>
              <option value={`course:${course.value}`}>Whole course: {course.label}</option>
              {lecturesIn(course.value).map((lecture) => (
                <option key={lecture.id} value={`lecture:${lecture.id}`}>{lecture.title}</option>
              ))}
            </optgroup>
          ))}
          <optgroup label="No course">
            <option value="unfiled">Not filed under a course</option>
            {unfiledLectures.map((lecture) => (
              <option key={lecture.id} value={`lecture:${lecture.id}`}>{lecture.title}</option>
            ))}
          </optgroup>
        </Select>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-control px-3 text-body font-semibold text-text-secondary hover:bg-surface-overlay"
          >
            Cancel
          </button>
          <button type="submit" className="h-9 rounded-control bg-accent px-3 text-body font-semibold text-accent-foreground">
            Move
          </button>
        </div>
      </form>
    </Dialog>
  )
}
