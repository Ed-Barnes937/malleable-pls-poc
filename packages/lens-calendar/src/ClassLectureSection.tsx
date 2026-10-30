import { useEffect, useMemo, useState } from 'react'
import { useManifests, useSubstrate, type FocusedClassLecture, type LectureBoardRef } from '@pls/lens-framework'
import { CLASS_CAPTURE_LEAD_MIN } from '@pls/substrate'
import { cn } from '@pls/shared-ui'
import { AudioLines, Loader2 } from 'lucide-react'
import { formatDuration } from './time'

/**
 * A class block's lecture while its popover is open: being found (or made),
 * focused on the board, or not (the board is unchanged). `request` tells one
 * open of the popover from the next, so a late answer is never shown on a
 * later one.
 */
export type ClassLectureState =
  | { state: 'pending'; request: number }
  | {
      state: 'focused'
      request: number
      lecture: FocusedClassLecture
      changed: boolean
      undo?: () => Promise<boolean>
    }
  | { state: 'failed'; request: number }

/** How long "Finding this lecture..." waits before showing, so a quick answer doesn't flash it. */
export const FINDING_DELAY_MS = 300
/** "Also open in" shows this many boards, then "More boards...". */
export const BOARDS_SHOWN = 3

/**
 * What the class occurrence's lecture has: "Recorded · 52 min" once it has
 * audio, else where the class is in time: "On now" (from 15 minutes before
 * it starts, as Record joins it), "Upcoming", or "No recording yet".
 */
export function lectureStatus(
  recordings: ReadonlyArray<{ duration: number }> | undefined,
  occurrence: { starts_at: string | null; ends_at: string | null },
  now: number,
): string {
  if (recordings && recordings.length > 0) {
    const minutes = Math.round(recordings.reduce((sum, r) => sum + (r.duration ?? 0), 0) / 60_000)
    return minutes > 0 ? `Recorded · ${formatDuration(minutes)}` : 'Recorded'
  }
  const start = occurrence.starts_at ? Date.parse(occurrence.starts_at) : NaN
  const end = occurrence.ends_at ? Date.parse(occurrence.ends_at) : start
  if (Number.isFinite(start)) {
    if (now >= start - CLASS_CAPTURE_LEAD_MIN * 60_000 && now <= end) return 'On now'
    if (now < start) return 'Upcoming'
  }
  return 'No recording yet'
}

/** "Audio Capture, Transcript and Connections": names as a person would list them. */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export interface ClassLectureSectionProps {
  lecture: ClassLectureState
  /** The occurrence opened, for its status before it has audio. */
  occurrence: { starts_at: string | null; ends_at: string | null }
  now: Date
  /** Other boards that can show a lecture (`LensProps.lectureBoards`). */
  lectureBoards: LectureBoardRef[]
  /** Whether this board has a widget that shows a lecture. */
  boardShowsLectures: boolean
  /** A phone: rows go full width and at least 44px tall. */
  narrow?: boolean
  onRetry: () => void
  /** Absent when the host can't switch boards. */
  onOpenOn?: (boardId: string, lecture: FocusedClassLecture) => Promise<'opened' | 'failed' | 'gone'>
  /** Opens the widget palette; absent when the host has none. */
  onAddWidget?: () => void
}

/**
 * The Lecture row of a class block's popover: the lecture the open focused
 * on the board (with Undo when that changed the board), "Also open in" for
 * the student's other boards that can show it, and, when no board can, a
 * quiet way to add a widget that does. It keeps one height from pending to
 * answered, so a press aimed at the popover's buttons (a phone's second
 * tap) isn't moved by the answer arriving.
 */
export function ClassLectureSection({
  lecture, occurrence, now, lectureBoards, boardShowsLectures, narrow, onRetry, onOpenOn, onAddWidget,
}: ClassLectureSectionProps) {
  const substrate = useSubstrate()
  const manifests = useManifests()
  const focused = lecture.state === 'focused' ? lecture : undefined
  // Live, so audio arriving (a recording in another tab) updates the status.
  const { data: stored } = substrate.useLecture(focused?.lecture.id)
  const [showFinding, setShowFinding] = useState(false)
  const [undo, setUndo] = useState<'idle' | 'undoing' | 'undone' | 'failed'>('idle')
  const [opening, setOpening] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [allBoards, setAllBoards] = useState(false)

  useEffect(() => {
    setUndo('idle')
    if (lecture.state !== 'pending') return setShowFinding(false)
    const timer = setTimeout(() => setShowFinding(true), FINDING_DELAY_MS)
    return () => clearTimeout(timer)
  }, [lecture.state, lecture.request])

  const lectureWidgets = useMemo(
    () => listNames(manifests.filter((m) => m.scope?.lectureId === 'target').map((m) => m.label)),
    [manifests],
  )
  const status = focused
    ? lectureStatus(stored?.id === focused.lecture.id ? stored.recordings : undefined, occurrence, now.getTime())
    : null
  const title = stored?.id === focused?.lecture.id ? stored?.title ?? focused?.lecture.title : focused?.lecture.title

  const boards = allBoards ? lectureBoards : lectureBoards.slice(0, BOARDS_SHOWN)
  const hidden = lectureBoards.length - boards.length

  const openOn = async (boardId: string) => {
    if (!focused || !onOpenOn || opening) return
    setOpening(boardId)
    setOpenError(null)
    const result = await onOpenOn(boardId, { id: focused.lecture.id, title: title ?? focused.lecture.title })
    // Opened: the board switched and this calendar went with it.
    if (result === 'opened') return
    setOpening(null)
    setOpenError(result === 'gone' ? 'That board is gone.' : "Couldn't open it there. Try again?")
  }

  const link = 'shrink-0 rounded-item px-2 text-meta font-semibold text-accent transition-colors hover:bg-surface-overlay disabled:opacity-50'
  const row = narrow ? 'min-h-11 w-full' : 'min-h-8'

  return (
    <section data-testid="class-lecture" aria-label="Lecture" className="flex flex-col gap-2 border-t border-border-subtle pt-3">
      <div className="flex min-h-10 items-start gap-2">
        <AudioLines aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
        <div role="status" data-testid="class-lecture-status" data-state={lecture.state} className="min-w-0 flex-1">
          {lecture.state === 'pending' && (
            <p className={cn('text-body text-text-secondary', !showFinding && 'invisible')}>Finding this lecture...</p>
          )}
          {focused && (
            <>
              <p title={title} className="truncate text-body font-semibold text-text-primary">
                <span className="sr-only">Showing </span>
                {title}
              </p>
              <p className="text-meta text-text-secondary">{status}</p>
            </>
          )}
          {lecture.state === 'failed' && <p className="text-body text-confused">Couldn't show this lecture.</p>}
        </div>
        {focused?.changed && focused.undo && (undo === 'undone' ? (
          <span className="shrink-0 px-2 py-1 text-meta text-text-muted">Undone</span>
        ) : (
          <button
            type="button"
            disabled={undo === 'undoing'}
            onClick={async () => {
              setUndo('undoing')
              setUndo((await focused.undo!()) ? 'undone' : 'failed')
            }}
            className={cn(link, narrow ? 'min-h-11' : 'h-8')}
          >
            Undo
          </button>
        ))}
        {lecture.state === 'failed' && (
          <button type="button" onClick={onRetry} className={cn(link, narrow ? 'min-h-11' : 'h-8')}>Try again</button>
        )}
      </div>
      {undo === 'failed' && <p role="alert" className="text-meta text-confused">Couldn't undo. Try again?</p>}

      {lectureBoards.length > 0 && onOpenOn && (
        <div role="group" aria-labelledby="class-lecture-also" className="flex flex-col gap-1">
          <p id="class-lecture-also" className="text-meta font-semibold text-text-muted">Also open in</p>
          <div className={cn('flex gap-1.5', narrow ? 'flex-col' : 'flex-wrap')}>
            {boards.map((b) => (
              <button
                key={b.id}
                type="button"
                // Usable once the lecture is known; it never moves meanwhile.
                aria-disabled={!focused || (opening !== null && opening !== b.id) || undefined}
                aria-busy={opening === b.id || undefined}
                onClick={() => void openOn(b.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-control border border-border bg-surface-raised px-3 text-body font-medium text-text-primary transition-colors hover:bg-surface-overlay aria-disabled:opacity-50',
                  row,
                )}
              >
                {opening === b.id && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                {b.name}
              </button>
            ))}
            {hidden > 0 && (
              <button type="button" onClick={() => setAllBoards(true)} className={cn(link, row, 'text-left')}>
                More boards...
              </button>
            )}
          </div>
        </div>
      )}
      {openError && <p role="alert" className="text-meta text-confused">{openError}</p>}

      {lectureBoards.length === 0 && !boardShowsLectures && onAddWidget && lectureWidgets && (
        <p data-testid="class-lecture-hint" className="text-meta text-text-muted">
          {lectureWidgets} show a lecture.{' '}
          <button type="button" onClick={onAddWidget} className={cn('font-semibold text-accent underline-offset-2 hover:underline', narrow && 'min-h-11')}>
            Add a widget
          </button>
        </p>
      )}
    </section>
  )
}
