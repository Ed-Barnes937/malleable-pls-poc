import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
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
  useWorkspaceScopes,
} from '@pls/substrate-client'
import { isEmptyLectureDeletion, type Lecture, type LectureDeletePreview } from '@pls/substrate'
import { COURSES, cn, courseTone } from '@pls/shared-ui'
import { useBoardScopeDims } from './useBoardScopeDims'
import { ScopePill, type ScopePillFace } from './ScopePill'
import { useToastStore } from './toast'
import { DeleteLectureDialog } from './DeleteLectureDialog'

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
      // Never narrower than its pills can go (the course whole, a few words
      // of the lecture): the tabs and the today line give way first.
      className={cn('flex items-center gap-1.5', compact ? 'max-w-full' : 'shrink')}
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
  const menuRef = useRef<HTMLButtonElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  // The lecture being renamed. The field goes if the board moves to another
  // lecture meanwhile (from elsewhere: a moment opened, another tab), rather
  // than rename the wrong one.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  if (renamingId !== null && renamingId !== lectureId) setRenamingId(null)
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
        // keeps a few words; "No lecture" is short and never cut.
        className={current ? 'max-w-[32ch] min-w-24 shrink md:min-w-36' : 'shrink-0'}
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
        />
      )}
      {deletion.dialog}
    </>
  )
}

/**
 * The lecture's own actions, beside its pill: one small button (so the
 * header has room for it at every width) opening a menu of "Rename this
 * lecture..." and "Delete this lecture...". Arrow keys move through it,
 * Escape or a press elsewhere closes it, and focus goes back to the button.
 * Rendered over the page (a portal), so the header never clips it.
 */
function LectureMenu({ buttonRef, busy, onRename, onDelete }: {
  buttonRef: RefObject<HTMLButtonElement | null>
  /** A delete is being worked out: Delete waits. */
  busy: boolean
  onRename: () => void
  onDelete: () => void
}) {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null)
  const menu = useRef<HTMLDivElement>(null)
  const open = at !== null
  const items = [
    { label: 'Rename this lecture...', run: onRename, disabled: false },
    { label: 'Delete this lecture...', run: onDelete, disabled: busy },
  ]

  const close = useCallback((refocus: boolean) => {
    setAt(null)
    if (refocus) buttonRef.current?.focus()
  }, [buttonRef])

  useLayoutEffect(() => {
    if (open) menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
  }, [open])

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
          aria-label="Lecture options"
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
                close(true)
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
