import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, Pencil } from 'lucide-react'
import {
  decodeScope,
  useLecture,
  useLectures,
  usePreferences,
  useSetBoardScope,
  useUpdateLecture,
  useWorkspacePanels,
  useWorkspaceScopes,
} from '@pls/substrate-client'
import type { Lecture } from '@pls/substrate'
import { COURSES, cn, courseTone } from '@pls/shared-ui'
import { useBoardScopeDims } from './useBoardScopeDims'
import { ScopePill, type ScopePillFace } from './ScopePill'
import { useToastStore } from './toast'

export interface BoardScopeProps {
  workspaceId: string
  /** Phone layout: no "Showing" word, the pills share their row with Up next. */
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

  // Shown once already: when it shows again (another board, or the first
  // widget that uses it) it arrives with the shared motion; not as the app
  // first opens.
  const { data: panels } = useWorkspacePanels(workspaceId)
  const loaded = !!rows && !!panels
  const visible = loaded && dims.size > 0
  const shownBefore = useRef(false)
  useLayoutEffect(() => {
    if (visible) shownBefore.current = true
  })
  // Another board still loading: the pills shown stay (out of reach) until
  // its own arrive, rather than leave a gap that moves Up next and come back.
  const lastShown = useRef<{ scope: typeof scope; dims: typeof dims } | null>(null)
  if (loaded) lastShown.current = visible ? { scope, dims } : null
  const shown = loaded ? (visible ? { scope, dims } : null) : lastShown.current
  if (!shown) return null
  const showCourse = shown.dims.has('courseTag')
  const showLecture = shown.dims.has('lectureId')

  return (
    <ScopeGroup compact={compact} arrive={shownBefore.current} stale={!loaded}>
      {/* Only where the bar has room for it; the pills say enough without. */}
      {!compact && <span aria-hidden className="hidden shrink-0 pr-0.5 text-body text-text-secondary xl:inline">Showing</span>}
      {showCourse && (
        <CoursePill courseTag={shown.scope.courseTag} onChange={(value) => write({ courseTag: value || null })} />
      )}
      {showCourse && showLecture && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-text-muted" />}
      {showLecture && (
        <LecturePill
          courseTag={shown.scope.courseTag}
          lectureId={shown.scope.lectureId}
          onChange={(value) => write({ lectureId: value || null })}
        />
      )}
    </ScopeGroup>
  )
}

function courseLabel(courseTag: string): string {
  return courseTag ? (COURSES.find((c) => c.value === courseTag)?.label ?? courseTag) : 'All courses'
}

function CoursePill({ courseTag, onChange }: { courseTag: string | undefined; onChange: (value: string) => void }) {
  return (
    <ScopePill
      label="Course"
      data-testid="scope-course"
      value={courseTag ?? ''}
      onChange={onChange}
      describe={(value) => ({ text: courseLabel(value), dotClassName: courseTone(value || null).stripe })}
      // Never narrower than its dot and its course name.
      className="min-w-max shrink-0"
    >
      <option value="">All courses</option>
      {COURSES.map((c) => (
        <option key={c.value} value={c.value}>{c.label}</option>
      ))}
    </ScopePill>
  )
}

/** Whether a pill mounting now joins pills already on screen (so it should arrive with the shared motion). */
const JoinsShown = createContext(false)

function ScopeGroup({ compact, arrive, stale, children }: { compact: boolean; arrive: boolean; stale: boolean; children: ReactNode }) {
  // Kept from mount: the motion plays as it arrives, not on later renders.
  const [entering] = useState(arrive)
  const mounted = useRef(false)
  useLayoutEffect(() => {
    mounted.current = true
  }, [])
  return (
    <div
      role="group"
      aria-label="What this board shows"
      data-testid="board-scope"
      // Another board's pills, kept while this one's load: nothing to press yet.
      inert={stale || undefined}
      aria-busy={stale || undefined}
      // Never narrower than its pills can go (the course whole, a few words
      // of the lecture). In the top bar, short of room, it gives its own up
      // (down to that) well before the board tabs do, so a lecture's name
      // loading or changing never moves the tabs, or New board from under a
      // pointer.
      className={cn('flex origin-left items-center gap-1.5', compact ? 'min-w-0 shrink' : 'shrink-[1000]', entering && 'motion-safe:animate-enter')}
    >
      <JoinsShown.Provider value={mounted.current}>{children}</JoinsShown.Provider>
    </div>
  )
}

function LecturePill({ courseTag, lectureId, onChange }: {
  courseTag: string | undefined
  lectureId: string | undefined
  onChange: (value: string) => void
}) {
  // A widget starting to use lectures: the pill arrives with the shared motion.
  const [entering] = useState(useContext(JoinsShown))
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
  const renameRef = useRef<HTMLButtonElement>(null)
  // The lecture being renamed. The field goes if the board moves to another
  // lecture meanwhile (from elsewhere: a moment opened, another tab), rather
  // than rename the wrong one.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  if (renamingId !== null && renamingId !== lectureId) setRenamingId(null)

  // Selected but not loaded yet: say so rather than flash "No lecture".
  const loading = !!lectureId && selected === undefined
  const describe = (value: string): ScopePillFace => {
    if (!value) return { text: 'No lecture', muted: true }
    const lecture = value === current?.id ? current : lectures.find((l) => l.id === value)
    return lecture ? { text: lecture.title } : { text: 'Loading...', muted: true }
  }

  if (renamingId !== null && current) {
    return (
      <RenameInput
        key={current.id}
        lecture={current}
        onDone={() => {
          setRenamingId(null)
          // Back on the button it came from, for the keyboard.
          requestAnimationFrame(() => renameRef.current?.focus())
        }}
      />
    )
  }

  return (
    <>
      <ScopePill
        label="Lecture"
        data-testid="scope-lecture"
        value={current || loading ? lectureId! : ''}
        onChange={onChange}
        describe={describe}
        // A title is cut short before anything else in the bar, but always
        // keeps a few words; "No lecture" is short and never cut. Loading,
        // it already takes a title's least room, so the title arriving never
        // moves what is beside it in a full bar.
        className={cn(current || loading ? 'max-w-[32ch] min-w-24 shrink md:min-w-36' : 'shrink-0', entering && 'origin-left motion-safe:animate-enter')}
      >
        <option value="">No lecture</option>
        {loading && <option value={lectureId}>Loading...</option>}
        {lectures.map((l) => (
          <option key={l.id} value={l.id}>{lectureOptionLabel(l, dateOf(l))}</option>
        ))}
      </ScopePill>
      {/* A button, not an option in the list, so no arrow key or type-ahead lands on it. */}
      {current && (
        <button
          ref={renameRef}
          type="button"
          data-testid="lecture-rename-button"
          aria-label="Rename lecture"
          title="Rename this lecture"
          onClick={() => setRenamingId(current.id)}
          className="flex h-10 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none sm:h-9 sm:w-7"
        >
          <Pencil aria-hidden className="h-3.5 w-3.5" />
        </button>
      )}
      {/* Its room, kept while the lecture loads. */}
      {!current && loading && <span aria-hidden className="h-10 w-8 shrink-0 sm:h-9 sm:w-7" />}
    </>
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
