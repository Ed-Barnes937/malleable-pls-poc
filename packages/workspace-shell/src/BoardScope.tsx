import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, MoreHorizontal } from 'lucide-react'
import {
  decodeScope,
  useDeleteLecture,
  useLecture,
  useLectureDeletePreview,
  useLectures,
  usePreferences,
  useSetBoardScope,
  useUpdateLecture,
  useWorkspacePanels,
  useWorkspaceScopes,
} from '@pls/substrate-client'
import { isEmptyLectureDeletion, type Lecture, type LectureDeletePreview } from '@pls/substrate'
import { CourseOptions, NEUTRAL_TONE, cn, courseLabel, useActiveCourses, useCourseLookup, type CourseInfo } from '@pls/shared-ui'
import { useBoardScopeDims } from './useBoardScopeDims'
import { ScopePill, type ScopePillFace } from './ScopePill'
import { useToastStore } from './toast'
import { DeleteLectureDialog } from './DeleteLectureDialog'

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
 * (optimistic); the server's rules clear a lecture outside a new course and,
 * on a board with a course, bring a chosen lecture's course. An "All
 * courses" board stays "All courses" whatever lecture is chosen. A lecture
 * filed under no course offers "Choose a course" beside it.
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
        <CoursePill compact={compact} courseTag={shown.scope.courseTag} onChange={(value) => write({ courseTag: value || null })} />
      )}
      {/* Decoration only: it gives way first where the header is tightest (a
          phone, and sm to md), so a wide course ("All courses", "Chemistry")
          and the lecture still leave every button in view. */}
      {showCourse && showLecture && !compact && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-text-muted sm:max-md:hidden" />}
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

/**
 * A course pill's face: the course's name (" (archived)" when it is) and
 * dot. The board's id until its course is known shows no name, never the id.
 */
function coursePillFace(course: CourseInfo | null): { text: string; dotClassName: string } {
  return { text: course ? courseLabel(course) : '', dotClassName: (course?.tone ?? NEUTRAL_TONE).stripe }
}

function CoursePill({ compact, courseTag, onChange }: { compact: boolean; courseTag: string | undefined; onChange: (value: string) => void }) {
  const courseOf = useCourseLookup()
  return (
    <ScopePill
      label="Course"
      data-testid="scope-course"
      value={courseTag ?? ''}
      onChange={onChange}
      describe={(value) => (value ? coursePillFace(courseOf(value)) : { text: 'All courses', dotClassName: NEUTRAL_TONE.stripe })}
      // Never narrower than its dot and its course name; on a phone's one
      // line, cut short (the whole name in its tooltip and the list) down to
      // 5rem, so with the lecture pill at its floor, the lecture's menu and
      // Up next all fit from 360px.
      className={compact ? 'min-w-20 shrink' : 'min-w-max shrink-0'}
    >
      <option value="">All courses</option>
      <CourseOptions current={courseTag} />
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
  // The selected lecture is in the list (in the course, or any on "All
  // courses"), but the list may not have caught up with one made a moment
  // ago (an upload): never show it as unset.
  const { data: selected } = useLecture(lectureId)
  const current = lectureId && selected?.id === lectureId ? selected : undefined
  const lectures = current && !courseLectures?.some((l) => l.id === current.id)
    ? [current, ...(courseLectures ?? [])]
    : (courseLectures ?? [])
  const dateOf = useLectureDate()
  const menuRef = useRef<HTMLButtonElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  // The lecture being renamed. The field goes if the board moves to another
  // lecture meanwhile (from elsewhere: a moment opened, another tab), rather
  // than rename the wrong one.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  if (renamingId !== null && renamingId !== lectureId) setRenamingId(null)
  const fileUnder = useFileLectureUnderCourse()
  const deletion = useLectureDeletion({
    onCancel: () => menuRef.current?.focus(),
    // The menu goes with the lecture: focus the pill, which now reads "No lecture".
    onDeleted: () => requestAnimationFrame(() => selectRef.current?.focus()),
  })

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
          requestAnimationFrame(() => menuRef.current?.focus())
        }}
      />
    )
  }

  return (
    <>
      <ScopePill
        ref={selectRef}
        label="Lecture"
        data-testid="scope-lecture"
        value={current || loading ? lectureId! : ''}
        onChange={onChange}
        describe={describe}
        // A title is cut short before anything else in the bar, but always
        // keeps a few words (a little less from sm to md, where the one-row
        // header is tightest: a wide course such as "All courses" beside it
        // must still leave the buttons in view); "No lecture" is short and
        // never cut. Loading, it already takes a title's least room, so the
        // title arriving never moves what is beside it in a full bar. It is
        // cut before the course (on a phone, where the course can be cut too).
        className={cn(current || loading ? 'max-w-[32ch] min-w-24 shrink-[1000] sm:min-w-20 md:min-w-36' : 'shrink-0', entering && 'origin-left motion-safe:animate-enter')}
      >
        <option value="">No lecture</option>
        {loading && <option value={lectureId}>Loading...</option>}
        {lectures.map((l) => (
          <option key={l.id} value={l.id}>{lectureOptionLabel(l, dateOf(l))}</option>
        ))}
      </ScopePill>
      {/* A button, not an option in the list, so no arrow key or type-ahead lands on it. */}
      {current && (
        <LectureMenu
          buttonRef={menuRef}
          busy={deletion.checking}
          onRename={() => setRenamingId(current.id)}
          onDelete={() => deletion.start(current)}
          onFileUnder={current.course === null ? (course) => fileUnder(current, course) : undefined}
        />
      )}
      {/* Its room, kept while the lecture loads. */}
      {!current && loading && <span aria-hidden className="h-10 w-8 shrink-0 sm:h-9 sm:w-7" />}
      {/* Beside the menu where the header has room; on a phone only in the menu. */}
      {current && current.course === null && (
        <FileUnderCoursePill
          onFile={(course) => {
            fileUnder(current, course)
            // The pill goes once the lecture has a course: keep the keyboard on the lecture.
            requestAnimationFrame(() => selectRef.current?.focus())
          }}
        />
      )}
      {deletion.dialog}
    </>
  )
}

/**
 * The lecture's own actions, beside its pill: one small button (so the
 * header has room for it at every width) opening a menu of "Rename this
 * lecture...", "Delete this lecture..." and, for a lecture filed under no
 * course, "Choose a course..." (which lists the courses in its place). Arrow keys move through it,
 * Escape or a press elsewhere closes it, and focus goes back to the button.
 * Rendered over the page (a portal), so the header never clips it.
 */
function LectureMenu({ buttonRef, busy, onRename, onDelete, onFileUnder }: {
  buttonRef: RefObject<HTMLButtonElement | null>
  /** A delete is being worked out: Delete waits. */
  busy: boolean
  onRename: () => void
  onDelete: () => void
  /** For a lecture filed under no course: "Choose a course...", then the courses. */
  onFileUnder?: (course: string) => void
}) {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null)
  // "Choose a course..." swaps the actions for the courses, in the same menu.
  const [choosingCourse, setChoosingCourse] = useState(false)
  const courses = useActiveCourses()
  const menu = useRef<HTMLDivElement>(null)
  const open = at !== null
  const items: { label: string; run: () => void; disabled: boolean; keepOpen?: boolean }[] = choosingCourse && onFileUnder
    ? courses.map((c) => ({ label: c.name, run: () => onFileUnder(c.id), disabled: false }))
    : [
        { label: 'Rename this lecture...', run: onRename, disabled: false },
        ...(onFileUnder ? [{ label: 'Choose a course...', run: () => setChoosingCourse(true), disabled: false, keepOpen: true }] : []),
        { label: 'Delete this lecture...', run: onDelete, disabled: busy },
      ]

  const close = useCallback((refocus: boolean) => {
    setAt(null)
    setChoosingCourse(false)
    if (refocus) buttonRef.current?.focus()
  }, [buttonRef])

  useLayoutEffect(() => {
    if (open) menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
  }, [open, choosingCourse])

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      const target = e.target as Node
      if (!menu.current?.contains(target) && !buttonRef.current?.contains(target)) close(false)
    }
    // It is placed once, under the button: anything that moves the button closes it.
    const moved = () => close(false)
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', moved)
    window.addEventListener('scroll', moved, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', moved)
      window.removeEventListener('scroll', moved, true)
    }
  }, [open, close, buttonRef])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabled = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement)
    const move = (to: number) => {
      e.preventDefault()
      enabled[(to + enabled.length) % enabled.length]?.focus()
    }
    if (e.key === 'ArrowDown') move(index + 1)
    else if (e.key === 'ArrowUp') move(index - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(enabled.length - 1)
    else if (e.key === 'Escape') {
      // Not the board menu's or a dialog's Escape.
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === 'Tab') {
      // Back on the button, rather than focus falling out of the page with the menu.
      e.preventDefault()
      close(true)
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-testid="lecture-menu-button"
        aria-label="Lecture options"
        title="Rename or delete this lecture"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) return close(false)
          const box = buttonRef.current!.getBoundingClientRect()
          setAt({ top: box.bottom + 4, right: Math.max(8, window.innerWidth - box.right) })
        }}
        className={cn(
          'flex h-10 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none sm:h-9 sm:w-7',
          open && 'bg-surface-overlay text-text-primary',
        )}
      >
        <MoreHorizontal aria-hidden className="h-4 w-4" />
      </button>
      {at && createPortal(
        <div
          ref={menu}
          role="menu"
          aria-label={choosingCourse ? 'File this lecture under' : 'Lecture options'}
          data-testid="lecture-menu"
          onKeyDown={onKeyDown}
          style={{ top: at.top, right: at.right }}
          // Above the top bar (z 9999), under the activity drawer and dialogs.
          className="fixed z-[10002] flex min-w-48 flex-col rounded-widget border border-border-subtle bg-surface-raised p-1 shadow-pop"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (!item.keepOpen) close(true)
                item.run()
              }}
              className="flex h-10 items-center rounded-item px-3 text-left text-body text-text-primary hover:bg-surface-overlay focus-visible:bg-surface-overlay focus-visible:outline-none disabled:opacity-40 sm:h-9"
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

/**
 * Deleting a lecture from the header: asks the server what it would remove
 * (`lectures.deletePreview`); an empty lecture (nothing recorded, no
 * resources or plan items from it) goes at once, anything else waits for
 * the confirm step (`DeleteLectureDialog`). Either way the toast names it.
 * `onCancel` puts focus back where it came from when the student keeps it,
 * `onDeleted` somewhere that is still there once it is gone.
 */
function useLectureDeletion({ onCancel, onDeleted }: { onCancel: () => void; onDeleted: () => void }) {
  const fetchPreview = useLectureDeletePreview()
  const deleteLecture = useDeleteLecture()
  const pushToast = useToastStore((s) => s.push)
  const [checking, setChecking] = useState(false)
  const [confirming, setConfirming] = useState<{ preview: LectureDeletePreview; hasClass: boolean } | null>(null)

  const deleted = (title: string) => {
    pushToast({ message: `Deleted ${title}`, tone: 'success', key: 'lecture-delete' })
    onDeleted()
  }
  const failed = () => pushToast({ message: "Couldn't delete the lecture - try again", tone: 'error', key: 'lecture-delete' })

  const start = async (lecture: Lecture) => {
    setChecking(true)
    try {
      // Twice at most: an empty lecture that gained something meanwhile (CONFLICT) is shown for confirming.
      for (let attempt = 0; attempt < 2; attempt++) {
        const preview = await fetchPreview(lecture.id)
        if (!isEmptyLectureDeletion(preview)) {
          setConfirming({ preview, hasClass: lecture.class_item_id !== null })
          return
        }
        try {
          await deleteLecture.mutateAsync({ id: lecture.id, fingerprint: preview.fingerprint })
          deleted(lecture.title)
          return
        } catch (err) {
          if ((err as { data?: { code?: string } | null }).data?.code !== 'CONFLICT') throw err
        }
      }
      failed()
    } catch (err) {
      // Gone already (another tab): what the student wanted.
      if ((err as { data?: { code?: string } | null }).data?.code === 'NOT_FOUND') deleted(lecture.title)
      else failed()
    } finally {
      setChecking(false)
    }
  }

  const dialog = confirming && (
    <DeleteLectureDialog
      preview={confirming.preview}
      hasClass={confirming.hasClass}
      onClose={() => {
        setConfirming(null)
        onCancel()
      }}
      onDeleted={(title) => {
        setConfirming(null)
        deleted(title)
      }}
    />
  )
  return { start: (lecture: Lecture) => void start(lecture), checking, dialog }
}

/**
 * Files a lecture filed under none under `course` (`lectures.update`, shown
 * at once). The board keeps its course ("All courses", the only board that
 * shows an unfiled lecture). A failure says so, and the offers come back.
 */
function useFileLectureUnderCourse(): (lecture: Lecture, course: string) => void {
  const { mutateAsync } = useUpdateLecture()
  const pushToast = useToastStore((s) => s.push)
  return useCallback((lecture: Lecture, course: string) => {
    // A promise: the offers are gone once the lecture has its course.
    mutateAsync({ id: lecture.id, course }).catch(() =>
      pushToast({ message: "Couldn't file the lecture - try again", tone: 'error', key: 'lecture-file-course' }),
    )
  }, [mutateAsync, pushToast])
}

/**
 * "Choose a course" beside a lecture filed under none (from `lg` up; the
 * lecture menu offers it at every width): picking one files it there. Gone
 * once the lecture has a course.
 */
function FileUnderCoursePill({ onFile }: { onFile: (course: string) => void }) {
  const courseOf = useCourseLookup()
  return (
    <ScopePill
      label="File this lecture under a course"
      data-testid="lecture-file-course"
      value=""
      onChange={(course) => {
        if (course) onFile(course)
      }}
      describe={(value) => (value
        ? coursePillFace(courseOf(value))
        : { text: 'Choose a course', muted: true })}
      // Only where the header has room for it (lg up): below that the menu offers it.
      className="hidden min-w-max shrink-0 lg:inline-flex"
    >
      <option value="" disabled>Choose a course</option>
      <CourseOptions />
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
