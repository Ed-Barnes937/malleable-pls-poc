import { useEffect, useMemo, useRef, useState } from 'react'
import { useManifests, useSubstrate, type FocusClassResult, type FocusedClassLecture, type LectureBoardRef, type UndoFocusClassResult } from '@pls/lens-framework'
import { CLASS_CAPTURE_LEAD_MIN, type BoardScope } from '@pls/substrate'
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
      lecture: Extract<FocusClassResult, { status: 'focused' }>['lecture']
      /** Present when the open changed the board: puts back what it showed. */
      undo?: () => Promise<UndoFocusClassResult>
      /** The board as the open left it (what Undo works from); Undo goes once the board shows something else. */
      after?: BoardScope
    }
  | { state: 'failed'; request: number }

/** How long "Finding this lecture..." waits before showing, so a quick answer doesn't flash it. */
export const FINDING_DELAY_MS = 300
/** "Also open in" shows this many boards, then "More boards...". */
export const BOARDS_SHOWN = 3

/** A lecture's audio: how many recordings, and how long they are together. */
export interface LectureAudio {
  recordingCount: number
  durationMs: number
}

/** `LectureAudio` of a lecture's recordings. */
export function lectureAudio(recordings: ReadonlyArray<{ duration: number | null }>): LectureAudio {
  return { recordingCount: recordings.length, durationMs: recordings.reduce((sum, r) => sum + (r.duration ?? 0), 0) }
}

/**
 * What the class occurrence's lecture has: "Recorded · 52 min" once it has
 * audio, else where the class is in time: "On now" (from 15 minutes before
 * it starts, as Record joins it), "Upcoming", or "No recording yet".
 */
export function lectureStatus(
  audio: LectureAudio | undefined,
  occurrence: { starts_at: string | null; ends_at: string | null },
  now: number,
): string {
  if (audio && audio.recordingCount > 0) {
    const minutes = Math.round(audio.durationMs / 60_000)
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
  /** Other boards that can show a lecture (`LensProps.lectureBoards`); undefined until they are known. */
  lectureBoards: LectureBoardRef[] | undefined
  /** Whether this board has a widget that shows a lecture. */
  boardShowsLectures: boolean
  /** The board's course and lecture now (undefined when the host doesn't say). */
  board?: BoardScope
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
 * quiet way to add a widget that does. Nothing in it changes height once
 * shown (pending to answered or failed, Undo and its outcome, a board that
 * couldn't open), so a press aimed at the popover's buttons (a phone's
 * second tap) is never moved by an answer arriving.
 */
export function ClassLectureSection({
  lecture, occurrence, now, lectureBoards, boardShowsLectures, board, narrow, onRetry, onOpenOn, onAddWidget,
}: ClassLectureSectionProps) {
  const substrate = useSubstrate()
  const manifests = useManifests()
  const focused = lecture.state === 'focused' ? lecture : undefined
  // Live, so audio arriving (a recording in another tab) updates the status.
  const { data: stored } = substrate.useLecture(focused?.lecture.id)
  const [showFinding, setShowFinding] = useState(false)
  const [undo, setUndo] = useState<'idle' | 'undoing' | UndoFocusClassResult>('idle')
  const [opening, setOpening] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [allBoards, setAllBoards] = useState(false)
  const boardRefs = useRef<Array<HTMLButtonElement | null>>([])
  /** "More boards..." was pressed: focus goes to the first board it shows. */
  const revealing = useRef(false)
  useEffect(() => {
    if (!allBoards || !revealing.current) return
    revealing.current = false
    boardRefs.current[BOARDS_SHOWN]?.focus()
  }, [allBoards])

  // Undo goes once the board has moved on from what the open left. The board
  // is read from a cache that catches up just after the answer, so only a
  // board seen showing it, and then showing something else, has moved on.
  const after = focused?.after
  const boardCourse = board?.courseTag
  const boardLecture = board?.lectureId
  const [movedOn, setMovedOn] = useState(false)
  const sawAfter = useRef(false)
  useEffect(() => {
    sawAfter.current = false
    setMovedOn(false)
  }, [lecture.request, lecture.state])
  useEffect(() => {
    if (!after || boardCourse === undefined || boardLecture === undefined) return
    if (boardCourse === after.courseTag && boardLecture === after.lectureId) sawAfter.current = true
    else if (sawAfter.current) setMovedOn(true)
  }, [after, boardCourse, boardLecture])

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
  // The lecture as loaded (live), else as the focus answer found it.
  const audio = focused && (stored?.id === focused.lecture.id ? lectureAudio(stored.recordings) : focused.lecture)
  const status = focused ? lectureStatus(audio || undefined, occurrence, now.getTime()) : null
  const title = stored?.id === focused?.lecture.id ? stored?.title ?? focused?.lecture.title : focused?.lecture.title

  const otherBoards = lectureBoards ?? []
  const boards = allBoards ? otherBoards : otherBoards.slice(0, BOARDS_SHOWN)
  const hidden = otherBoards.length - boards.length

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
  const button = narrow ? 'min-h-11' : 'h-8'
  // What Undo did, in place of the status line, so nothing below moves.
  const undoNote = undo === 'failed' ? "Couldn't undo. Try again?" : undo === 'changed' ? 'The board has changed since.' : null

  return (
    <section data-testid="class-lecture" aria-label="Lecture" className="flex flex-col gap-2 border-t border-border-subtle pt-3">
      {/* Tall enough for its tallest content at this width (two lines, or a phone's 44px button), from pending on. */}
      <div data-testid="class-lecture-row" className={cn('flex items-start gap-2', narrow ? 'min-h-11' : 'min-h-10')}>
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
              {undoNote
                ? <p className="truncate text-meta text-confused">{undoNote}</p>
                : <p className="truncate text-meta text-text-secondary">{status}</p>}
            </>
          )}
          {lecture.state === 'failed' && <p className="text-body text-confused">Couldn't show this lecture.</p>}
        </div>
        {focused?.undo && undo !== 'changed' && !(movedOn && (undo === 'idle' || undo === 'failed')) && (undo === 'undone' ? (
          <span className={cn('inline-flex shrink-0 items-center px-2 text-meta text-text-muted', button)}>Undone</span>
        ) : (
          <button
            type="button"
            disabled={undo === 'undoing'}
            onClick={async () => {
              setUndo('undoing')
              setUndo(await focused.undo!())
            }}
            className={cn(link, button)}
          >
            Undo
          </button>
        ))}
        {lecture.state === 'failed' && (
          <button type="button" onClick={onRetry} className={cn(link, button)}>Try again</button>
        )}
      </div>

      {otherBoards.length > 0 && onOpenOn && (
        <div role="group" aria-label="Also open in" className="flex flex-col gap-1">
          {/* A board that couldn't open says so in place of the label, so nothing moves. */}
          {openError
            ? <p role="alert" className="text-meta font-semibold text-confused">{openError}</p>
            : <p aria-hidden className="text-meta font-semibold text-text-muted">Also open in</p>}
          <div className={cn('flex gap-1.5', narrow ? 'flex-col' : 'flex-wrap')}>
            {boards.map((b, i) => (
              <button
                key={b.id}
                ref={(el) => { boardRefs.current[i] = el }}
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
              <button
                type="button"
                onClick={() => {
                  revealing.current = true
                  setAllBoards(true)
                }}
                className={cn(link, row, 'text-left')}
              >
                More boards...
              </button>
            )}
          </div>
        </div>
      )}

      {lectureBoards && lectureBoards.length === 0 && !boardShowsLectures && onAddWidget && lectureWidgets && (
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
