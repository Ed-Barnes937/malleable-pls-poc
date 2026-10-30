import { useMemo, useRef } from 'react'
import { useSubstrate } from '@pls/lens-framework'
import { reviewAutomationSentence, segmentAtOffset, type PlanItemOccurrence } from '@pls/substrate'
import { COURSES, TAG_STYLES, clockTime, cn, courseTone, dayLabel, formatDuration, formatTime, fromMomentLabel, leadingTag } from '@pls/shared-ui'
import { AudioLines, CalendarClock, Check, Clock, Loader2, Play, RotateCcw, X, Zap } from 'lucide-react'
import { useEscapeToClose, usePopoverPosition, type Span } from './popover-position'
import { PendingStatus, pendingLabel, pendingProps, type PendingAction } from './pending'

/**
 * "From Mitochondrial DNA - today · 1:18", with the time kept on the line of
 * the title's last word rather than wrapping onto a line of its own.
 */
export function momentSourceLabel(title: string, offsetMs: number | null | undefined): string {
  return fromMomentLabel(title, offsetMs).replace(/ · (\S+)$/, '\u00a0·\u00a0$1')
}

/**
 * The label split where it may wrap: the end that stays on one line is the
 * time with the title's last word and, after a spaced dash, the word before
 * it too ("DNA - today · 1:18"), so no line ends on a dash or starts with one
 * (a browser may break after "-" even before a no-break space).
 */
export function momentSourceParts(label: string): [head: string, tail: string] {
  const tail = /([^ ]+ - )?[^ ]+$/.exec(label)?.[0] ?? label
  return [label.slice(0, label.length - tail.length), tail]
}

/** A moment's source label that wraps only where it reads well (see `momentSourceParts`). */
export function MomentSourceText({ label }: { label: string }) {
  const [head, tail] = momentSourceParts(label)
  return <>{head}<span className="whitespace-nowrap">{tail}</span></>
}

/** Where a block's lecture moment went after "Go to moment". */
export type MomentState = 'opening' | 'shown' | 'nowhere' | 'failed'

export interface StudyBlockPopoverProps {
  /** Position relative to the calendar root. */
  x: number
  y: number
  /** The block pressed, relative to the calendar root: a popover that can't sit beside it goes above or below it. */
  span?: Span
  bounds: { width: number; height: number }
  /** A block made from a lecture moment: `source_type = 'recording'`. */
  row: PlanItemOccurrence
  moment?: MomentState
  canShowMoment: boolean
  canEdit: boolean
  busy?: boolean
  /** The action this popover is waiting on, named on its button while it saves. */
  pending?: PendingAction | null
  error?: string | null
  onGoToMoment: () => void
  onToggleDone?: () => void
  onEditTime: () => void
  /** Opens the automation that made the block; absent when the host can't. */
  onEditAutomation?: (workflowId: string) => void
  onClose: () => void
}

const WIDTH = 340

/** What the student did to the moment, in the popover's words. */
const MARK_WORDS: Record<string, string> = {
  confused: 'You marked this confusing',
  'key-point': 'You marked this as a key point',
  question: 'You marked this as a question',
}

function minutesLabel(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : formatDuration(minutes)
}

/**
 * The popover for a study block that came from a lecture moment: where it
 * came from first (the lecture, the line, what the student marked), then
 * "Go to moment", "Mark done" and "Edit time" (the date and time pickers live
 * behind it), and the automation that made it.
 *
 * Everything shown is read from `row` and the substrate on every render, so
 * when an automation moves the block the popover follows.
 */
export function StudyBlockPopover({
  x, y, span, bounds, row, moment, canShowMoment, canEdit, busy, pending, error,
  onGoToMoment, onToggleDone, onEditTime, onEditAutomation, onClose,
}: StudyBlockPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const pos = usePopoverPosition(ref, { x, y, span, bounds, width: WIDTH })
  useEscapeToClose(onClose)

  const substrate = useSubstrate()
  const recordingId = row.source_id ?? ''
  const offsetMs = row.source_offset_ms ?? 0
  const { data: recording } = substrate.useRecording(recordingId)
  const { data: segments } = substrate.useTranscript(recordingId)
  const { data: tags } = substrate.useTags({ recordingId })
  const { data: automation } = substrate.useAutomation(row.created_by_workflow_id ?? '')

  const segment = useMemo(
    () => (segments?.length ? segmentAtOffset(segments.filter((s) => s.recording_id === recordingId), offsetMs) : undefined),
    [segments, recordingId, offsetMs],
  )
  const mark = useMemo(() => {
    if (!segment) return undefined
    return leadingTag((tags ?? []).filter((t) => t.target_type === 'transcript_segment' && t.target_id === segment.id).map((t) => t.label))
  }, [tags, segment])

  const tone = courseTone(row.course)
  const courseLabel = row.course ? (COURSES.find((c) => c.value === row.course)?.label ?? row.course) : null
  const done = row.status === 'done'
  const minutes = row.starts_at && row.ends_at
    ? Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60_000)
    : row.duration_min
  const sentence = automation ? reviewAutomationSentence(automation) : null
  const markStyle = mark ? TAG_STYLES[mark] : undefined

  // What loads after the popover opens (the lecture's title, the line and its
  // mark, the automation) is given its room up front, so the buttons stay
  // where the student's finger is going: the title's two lines, the quote's
  // three and the mark's row are always reserved (the mark's blank when there
  // is none), and the automation's row while it loads.
  const quoteLoading = segments === undefined
  const automationLoading = !!row.created_by_workflow_id && automation === undefined

  const button = 'inline-flex h-10 items-center justify-center gap-2 rounded-control px-3.5 text-body font-medium transition-colors disabled:opacity-50'

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={row.title}
      data-testid="calendar-popover"
      data-variant="study-block"
      // A press in here doesn't close it (CalendarLens).
      data-calendar-popover
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-50 flex flex-col gap-3 rounded-widget border border-border-subtle bg-surface-raised p-4 shadow-pop"
      style={{ left: pos.left, top: pos.top, width: WIDTH }}
    >
      <div className="flex items-start gap-2">
        <p data-testid="calendar-moment-source" className={cn('flex min-w-0 flex-1 items-center gap-1.5 pt-1 text-body font-semibold', tone.ink)}>
          <AudioLines className="h-4 w-4 shrink-0" />
          <span className="line-clamp-2 min-h-[2lh]"><MomentSourceText label={momentSourceLabel(recording?.title ?? 'a lecture', offsetMs)} /></span>
        </p>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-item text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <h3 className="text-heading font-semibold leading-tight text-text-primary">{row.title}</h3>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-meta text-text-secondary">
        {courseLabel && (
          <span className={cn('rounded-full px-2 py-0.5 font-semibold', tone.tint, tone.ink)}>{courseLabel}</span>
        )}
        {row.starts_at && row.ends_at && (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" />
            {dayLabel(row.starts_at)} · {clockTime(row.starts_at)}-{clockTime(row.ends_at)}
          </span>
        )}
        {minutes != null && minutes > 0 && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {minutesLabel(minutes)}
          </span>
        )}
        {done && <span className="inline-flex items-center gap-1 font-semibold text-good"><Check className="h-3.5 w-3.5" />Done</span>}
      </div>

      {(segment || quoteLoading) && (
        <figure
          data-testid="calendar-moment-quote"
          className={cn('flex flex-col gap-1 rounded-item border-l-4 px-3 py-2.5', tone.soft, markStyle?.line ?? tone.stripeBorder)}
        >
          {!(mark && markStyle) && <div aria-hidden className="min-h-[1lh] text-meta" />}
          {mark && markStyle && (
            <figcaption className={cn('inline-flex items-center gap-1.5 text-meta font-semibold', markStyle.text)}>
              <markStyle.icon className="h-3.5 w-3.5" />
              {MARK_WORDS[mark]}
            </figcaption>
          )}
          <blockquote className="line-clamp-3 min-h-[3lh] text-body text-text-primary">{segment ? `"${segment.text}"` : null}</blockquote>
        </figure>
      )}

      <div data-testid="calendar-moment" className="flex flex-col gap-1.5">
        {canShowMoment && moment !== 'nowhere' && (
          <button
            type="button"
            autoFocus
            onClick={onGoToMoment}
            disabled={moment === 'opening'}
            className={cn(button, 'w-full bg-accent text-accent-foreground hover:opacity-90')}
          >
            <Play className="h-4 w-4" />
            {moment === 'failed' ? 'Try again' : 'Go to moment'}
          </button>
        )}
        {moment === 'opening' && <p className="text-meta text-text-muted">Opening the moment...</p>}
        {moment === 'failed' && <p className="text-meta text-text-muted">Couldn't open the moment just now.</p>}
        {moment === 'shown' && <p className="text-meta text-text-muted">Showing this moment in the Transcript.</p>}
        {moment === 'nowhere' && (
          <p className="text-meta text-text-muted">
            None of your boards has a Transcript yet. Add one from the widget drawer to see this moment.
          </p>
        )}
      </div>

      {canEdit && (
        <div className="grid grid-cols-2 gap-2">
          {onToggleDone && (
            <button
              type="button"
              {...pendingProps(busy, pending === 'done', onToggleDone)}
              className={cn(button, 'border border-border bg-surface-raised text-text-primary hover:bg-surface-overlay')}
            >
              {pending === 'done' ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : done ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {pending === 'done' ? pendingLabel('done', done) : done ? 'Not done yet' : 'Mark done'}
            </button>
          )}
          <button
            type="button"
            onClick={onEditTime}
            className={cn(button, 'border border-border bg-surface-raised text-text-primary hover:bg-surface-overlay', !onToggleDone && 'col-span-2')}
          >
            <CalendarClock className="h-4 w-4" />
            Edit time
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-meta text-confused">{error}</p>}
      <PendingStatus pending={pending} done={done} />

      {automationLoading && <div aria-hidden className="min-h-[2lh] border-t border-border-subtle pt-3 text-meta" />}
      {row.created_by_workflow_id && automation && (
        <p data-testid="calendar-made-by" className="flex items-start gap-1.5 border-t border-border-subtle pt-3 text-meta text-text-secondary">
          <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {sentence ? `Made by "${sentence}".` : 'Made by one of your automations.'}
            {onEditAutomation && (
              <>
                {' '}
                <button
                  type="button"
                  aria-label="Edit automation"
                  onClick={() => onEditAutomation(automation.id)}
                  className="font-semibold text-accent hover:underline"
                >
                  Edit
                </button>
              </>
            )}
          </span>
        </p>
      )}
    </div>
  )
}
