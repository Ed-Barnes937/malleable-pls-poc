import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  decodeScope,
  useLecture,
  useLectures,
  usePreferences,
  useSetBoardScope,
  useUpdateLecture,
  useWorkspaceScopes,
} from '@pls/substrate-client'
import type { Lecture } from '@pls/substrate'
import { COURSES, cn, courseTone } from '@pls/shared-ui'
import { useBoardScopeDims } from './useBoardScopeDims'
import { ScopePill } from './ScopePill'
import { useToastStore } from './toast'

/** The lecture picker's option that starts an inline rename instead of choosing a lecture. */
const RENAME = '__rename__'

export interface BoardScopeProps {
  workspaceId: string
  /** Phone layout: no "Showing" word, the pills share their row with the today line. */
  compact?: boolean
}

/**
 * What the board shows, as the controls that change it: a course pill and,
 * when a widget on the board targets or highlights a lecture, a lecture pill
 * ("Showing [Biology] > [Mitochondrial DNA]"). Only the dimensions some
 * widget uses are offered (`useBoardScopeDims`); nothing renders when no
 * widget uses any. Each choice is one `setBoardScope` write, shown at once
 * (optimistic); the server's rules clear a lecture outside a new course and
 * bring a chosen lecture's course.
 */
export function BoardScope({ workspaceId, compact = false }: BoardScopeProps) {
  const dims = useBoardScopeDims(workspaceId)
  const { data: rows } = useWorkspaceScopes(workspaceId)
  const scope = useMemo(() => decodeScope((rows ?? []) as { scope_type: string; scope_value: string }[]), [rows])
  const setBoardScope = useSetBoardScope()
  const pushToast = useToastStore((s) => s.push)

  // A promise rather than `mutate`'s callbacks, which are dropped if this
  // unmounts first (the board switched meanwhile).
  const { mutateAsync } = setBoardScope
  const write = useCallback(
    (patch: { courseTag?: string | null; lectureId?: string | null }) => {
      mutateAsync({ workspaceId, ...patch }).catch(() =>
        pushToast({ message: "Couldn't change what this board shows - try again", tone: 'error', key: 'board-scope' }),
      )
    },
    [workspaceId, mutateAsync, pushToast],
  )

  if (!rows || dims.size === 0) return null
  const showCourse = dims.has('courseTag')
  const showLecture = dims.has('lectureId')

  return (
    <div
      role="group"
      aria-label="What this board shows"
      data-testid="board-scope"
      className={cn('flex min-w-0 items-center gap-1.5', compact ? 'max-w-full' : 'shrink')}
    >
      {/* Only where the bar has room for it; the pills say enough without. */}
      {!compact && <span aria-hidden className="hidden shrink-0 pr-0.5 text-body text-text-secondary lg:inline">Showing</span>}
      {showCourse && (
        <CoursePill courseTag={scope.courseTag} onChange={(value) => write({ courseTag: value || null })} />
      )}
      {showCourse && showLecture && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-text-muted" />}
      {showLecture && (
        <LecturePill
          courseTag={scope.courseTag}
          lectureId={scope.lectureId}
          onChange={(value) => write({ lectureId: value || null })}
        />
      )}
    </div>
  )
}

function CoursePill({ courseTag, onChange }: { courseTag: string | undefined; onChange: (value: string) => void }) {
  const label = courseTag ? (COURSES.find((c) => c.value === courseTag)?.label ?? courseTag) : 'All courses'
  return (
    <ScopePill
      label="Course"
      data-testid="scope-course"
      value={courseTag ?? ''}
      onChange={onChange}
      text={label}
      dotClassName={courseTone(courseTag).stripe}
      // Never narrower than its dot and a short course name.
      className="shrink-0"
    >
      <option value="">All courses</option>
      {COURSES.map((c) => (
        <option key={c.value} value={c.value}>{c.label}</option>
      ))}
    </ScopePill>
  )
}

function LecturePill({ courseTag, lectureId, onChange }: {
  courseTag: string | undefined
  lectureId: string | undefined
  onChange: (value: string) => void
}) {
  // The course's lectures, newest first (every lecture on "All courses").
  const { data: courseLectures } = useLectures(courseTag)
  // The selected lecture is always in the course, but the list may not have
  // caught up with one made a moment ago (an upload): never show it as unset.
  const { data: selected } = useLecture(lectureId)
  const current = lectureId && selected?.id === lectureId ? selected : undefined
  const lectures = current && !courseLectures?.some((l) => l.id === current.id)
    ? [current, ...(courseLectures ?? [])]
    : (courseLectures ?? [])
  const dateOf = useLectureDate()
  const selectRef = useRef<HTMLSelectElement>(null)
  const [renaming, setRenaming] = useState(false)

  // Selected but not loaded yet: say so rather than flash "No lecture".
  const loading = !!lectureId && selected === undefined
  const text = current ? current.title : loading ? 'Loading...' : 'No lecture'

  if (renaming && current) {
    return (
      <RenameInput
        lecture={current}
        onDone={() => {
          setRenaming(false)
          // Back on the picker it came from, for the keyboard.
          requestAnimationFrame(() => selectRef.current?.focus())
        }}
      />
    )
  }

  return (
    <ScopePill
      ref={selectRef}
      label="Lecture"
      data-testid="scope-lecture"
      value={current || loading ? lectureId! : ''}
      onChange={(value) => (value === RENAME ? setRenaming(true) : onChange(value))}
      text={text}
      muted={!current}
      // A title is cut short before anything else in the bar, but always
      // keeps a few words; "No lecture" is short and never cut.
      className={current ? 'max-w-[32ch] min-w-24 shrink sm:min-w-36' : 'shrink-0'}
    >
      <option value="">No lecture</option>
      {loading && <option value={lectureId}>Loading...</option>}
      {lectures.map((l) => (
        <option key={l.id} value={l.id}>{lectureOptionLabel(l, dateOf(l))}</option>
      ))}
      {current && (
        <>
          <hr />
          <option value={RENAME}>Rename this lecture...</option>
        </>
      )}
    </ScopePill>
  )
}

/**
 * "Mitochondrial DNA · 16 Apr", plus "· No recording" for a lecture with no
 * audio yet. The date is left out when the title already has it (a default
 * title, "Biology lecture 16 Apr, 10:00").
 */
export function lectureOptionLabel(lecture: Pick<Lecture, 'title' | 'recordings'>, date: string): string {
  const parts = [lecture.title]
  if (!lecture.title.includes(date)) parts.push(date)
  if (lecture.recordings.length === 0) parts.push('No recording')
  return parts.join(' · ')
}

/** A lecture's day ("16 Apr") in the student's zone (their preference, else the browser's). */
function useLectureDate(): (lecture: Pick<Lecture, 'starts_at'>) => string {
  const { data: preferences } = usePreferences()
  const zone = preferences?.time_zone ?? undefined
  return useMemo(() => {
    const format = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: zone })
    return (lecture) => format.format(new Date(lecture.starts_at))
  }, [zone])
}

/**
 * The lecture pill as a text field holding the title, focused and selected:
 * Enter or leaving it saves (`lectures.update`), Escape cancels, an empty
 * name changes nothing.
 */
function RenameInput({ lecture, onDone }: { lecture: Lecture; onDone: () => void }) {
  const [value, setValue] = useState(lecture.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const finished = useRef(false)
  const updateLecture = useUpdateLecture()
  const pushToast = useToastStore((s) => s.push)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const finish = (save: boolean) => {
    // Enter saves and then blurs: only the first counts.
    if (finished.current) return
    finished.current = true
    const title = value.trim()
    if (save && title && title !== lecture.title) {
      // A promise: this field is gone before the write ends.
      updateLecture.mutateAsync({ id: lecture.id, title }).catch(() =>
        pushToast({ message: "Couldn't rename the lecture - try again", tone: 'error', key: 'lecture-rename' }),
      )
    }
    onDone()
  }

  return (
    <input
      ref={inputRef}
      aria-label="Lecture name"
      data-testid="lecture-rename"
      value={value}
      maxLength={500}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          finish(true)
        } else if (e.key === 'Escape') {
          // Not the board menu's or a dialog's Escape.
          e.preventDefault()
          e.stopPropagation()
          finish(false)
        }
      }}
      className="h-10 w-[32ch] max-w-full min-w-0 shrink rounded-full bg-surface-raised px-3 text-title font-semibold text-text-primary ring-2 ring-accent outline-none sm:h-9 sm:text-body"
    />
  )
}
