import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { LECTURE_SUMMARY_ANCHOR, segmentAtOffset, type PlanItemOccurrence, type Tag } from '@pls/substrate'
import { type LensProps, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { cn, COURSES, courseTone, dayAndTime, EmptyState, formatTime, fromMomentLabel, leadingTag, TagPill, TAG_STYLES, useArrivals } from '@pls/shared-ui'
import { ArrowRight, AudioLines, CalendarCheck, CalendarClock, ChevronRight, Clock, ListTodo, MessageSquare, Sparkles } from 'lucide-react'
import { ScrollRail } from './ScrollRail'

/** What happened to the review a marked moment turned into, in a few words; a planned one links to its block. */
function ReviewChip({ review, onShow }: { review: PlanItemOccurrence; onShow?: () => void }) {
  const minutes = review.duration_min ? `${review.duration_min} min` : null
  const done = review.status === 'done'
  const Icon = done ? CalendarCheck : review.starts_at ? CalendarClock : ListTodo
  const when = done
    ? 'Reviewed'
    : review.starts_at
      ? `Review planned · ${dayAndTime(review.starts_at)}`
      : 'Review on your to-do list'
  const label = [when, minutes].filter(Boolean).join(' · ')
  const className = cn(
    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-meta font-semibold',
    done ? 'border-transparent bg-good-soft text-good' : 'border-attn-line bg-attn-soft text-attn',
  )
  if (!onShow || done || !review.starts_at) {
    return (
      <span data-testid="review-chip" title={review.title} className={className}>
        <Icon className="h-3 w-3" />
        {label}
      </span>
    )
  }
  return (
    <button
      type="button"
      data-testid="review-chip"
      title="Show on calendar"
      aria-label={`${label}, show on calendar`}
      onClick={onShow}
      className={cn(className, 'text-left transition-colors hover:border-attn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-attn')}
    >
      <Icon className="h-3 w-3" />
      {label}
      <ArrowRight className="h-3 w-3" aria-hidden />
    </button>
  )
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * The one signature motion: a card for the new review lifts off the moment
 * and flies toward the board's Calendar, or its To-do list when the review
 * found no time (to the right if neither is on the board).
 * Decorative only; never shown under reduced motion.
 */
function LiftOff({ review, recordingTitle, onDone }: { review: PlanItemOccurrence; recordingTitle: string; onDone: (id: string) => void }) {
  // Drawn over the whole page (the transcript list would clip it), starting
  // at the moment's top-right corner.
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [flight, setFlight] = useState<{ left: number; top: number; x: number; y: number } | null>(null)
  const tone = courseTone(review.course)
  useLayoutEffect(() => {
    const anchor = anchorRef.current?.getBoundingClientRect()
    if (!anchor) return
    const left = anchor.right - LIFT_OFF_WIDTH_PX
    const top = anchor.top
    // A review with a time flies to the Calendar; one left without a time, to the To-do list.
    const target = document.querySelector(review.starts_at ? '[data-testid="calendar"]' : 'ul[aria-label="To-dos"]')?.getBoundingClientRect()
    setFlight(target
      ? {
          left,
          top,
          x: target.left + target.width / 2 - (left + LIFT_OFF_WIDTH_PX / 2),
          y: target.top + target.height / 3 - top,
        }
      : { left, top, x: 160, y: 0 })
  }, [review.starts_at])
  // Gone after its run, even if the animation never ends (e.g. a hidden tab).
  useEffect(() => {
    const t = setTimeout(() => onDone(review.id), 1400)
    return () => clearTimeout(t)
  }, [onDone, review.id])
  return (
    <>
      <span ref={anchorRef} aria-hidden className="pointer-events-none absolute right-2 top-1" />
      {flight && createPortal(
        <div
          aria-hidden
          data-testid="review-lift-off"
          className={cn(
            'pointer-events-none fixed z-50 hidden rounded-item border-l-4 bg-surface-raised px-3 py-2 shadow-pop motion-safe:block motion-safe:animate-lift-off',
            tone.stripeBorder,
          )}
          style={{
            left: flight.left,
            top: flight.top,
            width: LIFT_OFF_WIDTH_PX,
            '--lift-x': `${flight.x}px`,
            '--lift-y': `${flight.y}px`,
          } as CSSProperties}
        >
          <p className={cn('flex items-center gap-1 text-meta font-semibold', tone.ink)}>
            <Sparkles className="h-3 w-3" />
            {review.starts_at ? 'Adding to your plan' : 'Adding to your to-do list'}
          </p>
          <p className="truncate text-body font-semibold text-text-primary">{review.title}</p>
          <p className="flex min-w-0 items-center gap-1.5 text-meta text-text-secondary">
            <Clock className="h-3 w-3 shrink-0" />
            {review.duration_min ? <span className="shrink-0">{review.duration_min} min</span> : null}
            <span className="truncate">{fromMomentLabel(recordingTitle, review.source_offset_ms)}</span>
          </p>
        </div>,
        document.body,
      )}
    </>
  )
}

const LIFT_OFF_WIDTH_PX = 256

/** Space kept above a shown moment too tall to centre. */
const MOMENT_TOP_GAP = 8

/** Scrolls only the transcript list (scrollIntoView could also shift the board) to show a segment. */
function scrollToSegment(list: HTMLElement, segmentId: string) {
  const el = list.querySelector<HTMLElement>(`[data-segment-id="${segmentId}"]`)
  if (!el) return
  // Centre it, unless it is taller than the list: then show it from its first line.
  const top = el.clientHeight > list.clientHeight
    ? el.offsetTop - MOMENT_TOP_GAP
    : el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2
  list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

/** Moves keyboard focus to a segment's row without scrolling (the list scrolls itself). */
function focusSegment(list: HTMLElement, segmentId: string) {
  list.querySelector<HTMLElement>(`[data-segment-id="${segmentId}"] > button`)?.focus({ preventScroll: true })
}

/** The tag colours, named, so the gutter marks and rail don't rely on colour alone. */
const TAG_LEGEND = [
  { label: 'confused', text: 'Confused' },
  { label: 'key-point', text: 'Key point' },
  { label: 'question', text: 'Question' },
]

/** A calm note that the lecture's AI work is still under way. */
function InProgress({ icon: Icon, message, testId }: { icon: typeof Sparkles; message: string; testId: string }) {
  return (
    <p role="status" data-testid={testId} className="flex items-center gap-1.5 text-body text-text-secondary">
      <Icon className="h-3.5 w-3.5 shrink-0 text-accent motion-safe:animate-pulse" />
      {message}
    </p>
  )
}

export default function TranscriptLens({ scope, config, focusedMoment, onMomentShown, onShowPlanItem }: LensProps) {
  const substrate = useSubstrate()
  const mutations = useSubstrateMutations()

  const recordingId = scope.recordingId ?? ''
  const mode = (config.mode as string) ?? 'review'
  const isCapture = mode === 'capture'

  const { data: recording } = substrate.useRecording(recordingId)
  const { data: segments } = substrate.useTranscript(recordingId)
  const { data: tags } = substrate.useTags({ ...scope })
  const { data: annotations } = substrate.useAnnotations({ ...scope })
  // Reviews the confusion automation made from this lecture's moments.
  const { data: reviews } = substrate.usePlanItems(
    recordingId ? { sourceType: 'recording', sourceId: recordingId, kinds: ['task'], statuses: ['open', 'done'] } : undefined,
  )
  const createTag = mutations.useCreateTag()
  const createAnnotation = mutations.useCreateAnnotation()

  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [annotationDraft, setAnnotationDraft] = useState('')
  // The summary shows one line until opened; landing on a moment folds it
  // again, so the moment has the room.
  const [summaryOpen, setSummaryOpen] = useState(false)

  // A moment another widget asked to show (e.g. a calendar study block that
  // came from this lecture): scroll to its segment and highlight it, once per
  // request, once this lecture's segments, tags and notes have loaded (they
  // set the row heights the scroll position depends on).
  const [momentSegmentId, setMomentSegmentId] = useState<string | null>(null)
  const handledMomentId = useRef<number | null>(null)
  /** The landed moment should also take keyboard focus (the shell switched boards). */
  const focusLanded = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focusedMoment || focusedMoment.id === handledMomentId.current) return
    if (focusedMoment.recordingId !== recordingId) return
    const own = segments?.filter((s) => s.recording_id === recordingId)
    if (!own?.length || !tags || !annotations) return
    handledMomentId.current = focusedMoment.id
    focusLanded.current = !!focusedMoment.takeFocus
    setMomentSegmentId(segmentAtOffset(own, focusedMoment.offsetMs)?.id ?? null)
    setSelectedSegmentId(null)
    setSummaryOpen(false)
    onMomentShown?.(focusedMoment.id)
  }, [focusedMoment, recordingId, segments, tags, annotations, onMomentShown])
  useEffect(() => {
    if (!listRef.current || !momentSegmentId) return
    scrollToSegment(listRef.current, momentSegmentId)
    if (focusLanded.current) focusSegment(listRef.current, momentSegmentId)
    focusLanded.current = false
  }, [momentSegmentId])

  /** A rail mark: show that moment and put focus on it. */
  const goToSegment = (segmentId: string) => {
    if (!listRef.current) return
    scrollToSegment(listRef.current, segmentId)
    focusSegment(listRef.current, segmentId)
  }

  const tagsBySegment = useMemo(() => {
    const map = new Map<string, Tag[]>()
    for (const tag of tags ?? []) {
      if (tag.target_type === 'transcript_segment') {
        const list = map.get(tag.target_id) ?? []
        list.push(tag)
        map.set(tag.target_id, list)
      }
    }
    return map
  }, [tags])

  const annotationsBySegment = useMemo(() => {
    const map = new Map<string, { id: string; body: string }[]>()
    for (const ann of annotations ?? []) {
      if (ann.anchor_type === 'transcript_segment') {
        const list = map.get(ann.anchor_id) ?? []
        list.push(ann)
        map.set(ann.anchor_id, list)
      }
    }
    return map
  }, [annotations])

  const summaryLines = useMemo(() => {
    const summary = (annotations ?? []).find(
      (a) => a.anchor_type === LECTURE_SUMMARY_ANCHOR && a.anchor_id === recordingId,
    )
    return summary ? summary.body.split('\n').filter(Boolean) : []
  }, [annotations, recordingId])

  // The lecture's course: its own, else (a lecture filed under none) the
  // board's course, else the one its reviews were filed under. Unknown:
  // accent instead of course colours.
  const course = recording?.course ?? scope.courseTag ?? reviews?.find((r) => r.course)?.course ?? null
  const tone = course ? courseTone(course) : null
  const courseLabel = course ? (COURSES.find((c) => c.value === course)?.label ?? course) : null

  // Every tagged moment, by its leading tag, for the gutter marks and the scroll rail.
  const markBySegment = useMemo(() => {
    const map = new Map<string, string>()
    for (const [segmentId, segTags] of tagsBySegment) {
      const label = leadingTag(segTags.map((t) => t.label))
      if (label) map.set(segmentId, label)
    }
    return map
  }, [tagsBySegment])
  const lectureEnd = useMemo(() => Math.max(1, ...(segments ?? []).map((s) => s.end_ms)), [segments])
  const railMarks = useMemo(
    () => [...(segments ?? [])].sort((a, b) => a.start_ms - b.start_ms).flatMap((s) => {
      const label = markBySegment.get(s.id)
      return label ? [{ segmentId: s.id, startMs: s.start_ms, label }] : []
    }),
    [segments, markBySegment],
  )

  const reviewByOffset = useMemo(() => {
    const map = new Map<number, PlanItemOccurrence>()
    for (const review of reviews ?? []) {
      if (review.source_offset_ms != null && !map.has(review.source_offset_ms)) map.set(review.source_offset_ms, review)
    }
    return map
  }, [reviews])

  // A review that arrives while the lecture is open (the student just marked
  // its moment) gets the lift-off once; reviews already there never do.
  const arrived = useArrivals(reviews?.map((r) => r.id), recordingId)
  const [landedIds, setLandedIds] = useState<ReadonlySet<string>>(() => new Set())
  const reducedMotion = useMemo(prefersReducedMotion, [])
  const landed = useCallback((id: string) => setLandedIds((ids) => new Set([...ids, id])), [])

  // Until the transcript lands there is nothing to show but that it's coming.
  const transcribing = recording?.processing === 'transcribing' && !segments?.length
  const summarising = recording?.processing === 'summarising'

  const handleTag = (label: string) => {
    if (!selectedSegmentId) return
    createTag.mutate({ target_type: 'transcript_segment', target_id: selectedSegmentId, label })
  }

  const handleAnnotation = () => {
    if (!selectedSegmentId || !annotationDraft.trim()) return
    createAnnotation.mutate({
      anchor_type: 'transcript_segment',
      anchor_id: selectedSegmentId,
      body: annotationDraft.trim(),
    })
    setAnnotationDraft('')
  }

  if (!recordingId) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex flex-1 items-center justify-center">
          <EmptyState message="Pick a lecture to see its transcript" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="truncate text-title font-semibold text-text-primary">
          {recording?.title ?? 'Loading...'}
        </span>
        {tone && courseLabel && (
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-meta font-semibold', tone.tint, tone.ink)}>
            {courseLabel}
          </span>
        )}
        {recording && segments && !transcribing && (
          <span className="ml-auto shrink-0 text-meta text-text-muted tabular-nums">
            {segments.length} segments
          </span>
        )}
      </div>

      {railMarks.length > 0 && (
        <ul aria-label="Tag colours" data-testid="tag-legend" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-text-secondary">
          {TAG_LEGEND.map(({ label, text }) => (
            <li key={label} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn('h-1 w-3 rounded-full', TAG_STYLES[label].mark)} />
              {text}
            </li>
          ))}
        </ul>
      )}

      {transcribing && (
        <div className="flex flex-1 items-center justify-center">
          <InProgress icon={AudioLines} message="Transcribing your lecture..." testId="transcribing" />
        </div>
      )}

      {summarising && summaryLines.length === 0 && (
        <section aria-label="Lecture summary" className="rounded-item bg-surface-inset px-3.5 py-2.5">
          <InProgress icon={Sparkles} message="Writing your summary..." testId="summarising" />
        </section>
      )}

      {summaryLines.length > 0 && (
        <section
          aria-label="Lecture summary"
          // Capped so a long summary in a short widget still leaves the
          // transcript room to show and take clicks.
          className={cn('shrink-0 rounded-item bg-surface-inset px-3.5', summaryOpen ? 'max-h-[40%] overflow-y-auto py-2.5' : 'py-2')}
        >
          {/* One row either way, so the toggle stays where it is (and keeps focus). */}
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
            {summaryOpen
              ? <p className="min-w-0 flex-1 text-meta font-semibold text-text-muted">Summary</p>
              : <p data-testid="summary-line" className="min-w-0 flex-1 truncate text-body text-text-secondary">{summaryLines[0]}</p>}
            <button
              type="button"
              aria-expanded={summaryOpen}
              aria-controls={`summary-${recordingId}`}
              onClick={() => setSummaryOpen((open) => !open)}
              className="inline-flex shrink-0 items-center gap-0.5 text-body font-semibold text-accent hover:underline"
            >
              {summaryOpen ? 'Hide summary' : 'Show summary'}
              <ChevronRight className={cn('h-4 w-4 transition-transform', summaryOpen && 'rotate-90')} />
            </button>
          </div>
          {summaryOpen && (
            <ul id={`summary-${recordingId}`} className="mt-1 space-y-0.5">
              {summaryLines.map((line, i) => (
                <li key={i} className="text-body text-text-secondary">{line}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div hidden={transcribing} className="flex min-h-0 flex-1 gap-1.5">
      <div ref={listRef} className="relative -ml-3 min-h-0 flex-1 space-y-px overflow-y-auto pl-3 pr-1">
        {segments?.map((seg) => {
          const segTags = tagsBySegment.get(seg.id) ?? []
          const review = reviewByOffset.get(seg.start_ms)
          const segAnnotations = annotationsBySegment.get(seg.id) ?? []
          const isSelected = selectedSegmentId === seg.id
          const isMoment = momentSegmentId === seg.id
          const mark = markBySegment.get(seg.id)

          return (
            <div
              key={seg.id}
              data-segment-id={seg.id}
              data-moment={isMoment || undefined}
              // The moment's box holds its tags, its review chip and the tag buttons.
              className={cn(
                'relative rounded-item border transition-all',
                isSelected || isMoment
                  ? tone ? cn(tone.soft, tone.stripeBorder) : 'border-accent bg-accent-soft'
                  : 'border-transparent',
                // A shown moment also gets a soft halo, so it reads as "you landed here".
                isMoment && !isSelected && cn('ring-4', tone ? tone.ring : 'ring-accent-line'),
              )}
            >
              <button
                onClick={() => {
                  setMomentSegmentId(null)
                  setSelectedSegmentId(isSelected ? null : seg.id)
                }}
                aria-current={isMoment ? 'location' : undefined}
                className={cn(
                  'group flex w-full gap-2.5 rounded-item px-2.5 py-2 text-left transition-colors',
                  !(isSelected || isMoment) && 'hover:bg-surface-inset',
                )}
              >
                {/* Gutter mark: the moment's leading tag, at a glance down the page. */}
                <span
                  aria-hidden
                  data-testid={mark ? 'transcript-gutter-mark' : undefined}
                  data-tag={mark}
                  className={cn('w-1 shrink-0 self-stretch rounded-full', mark ? TAG_STYLES[mark].mark : 'bg-transparent')}
                />
                <span className={cn(
                  'min-w-9 shrink-0 pt-[3px] text-right font-mono text-meta tabular-nums',
                  isSelected || isMoment
                    ? cn('font-medium', tone ? tone.ink : 'text-accent')
                    : 'text-text-muted group-hover:text-text-secondary'
                )}>
                  {formatTime(seg.start_ms)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body leading-relaxed text-text-primary">
                    {seg.text}
                  </p>
                  {!isCapture && segAnnotations.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {segAnnotations.map((ann) => (
                        <div key={ann.id} className="flex items-start gap-1.5 rounded-item bg-surface-inset px-2 py-1 text-meta text-text-secondary">
                          <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-text-muted" />
                          {ann.body}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </button>

              {(segTags.length > 0 || review) && (
                <div className="-mt-1 flex flex-wrap items-center gap-1 pb-2 pl-[4.375rem] pr-2.5">
                  {segTags.map((tag) => <TagPill key={tag.id} label={tag.label} />)}
                  {review && (
                    <ReviewChip
                      review={review}
                      onShow={onShowPlanItem && review.starts_at
                        ? () => onShowPlanItem({ id: review.id, startsAt: review.starts_at! })
                        : undefined}
                    />
                  )}
                </div>
              )}
              {review && !reducedMotion && arrived.has(review.id) && !landedIds.has(review.id) && (
                <LiftOff review={review} recordingTitle={recording?.title ?? 'this lecture'} onDone={landed} />
              )}

              {isSelected && isCapture && (
                <div className="ml-[4.375rem] flex items-center gap-1 py-1.5">
                  {(['confused', 'key-point', 'question'] as const).map((label) => {
                    const style = TAG_STYLES[label]
                    const Icon = style.icon
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => handleTag(label)}
                        title={`Mark this moment as ${label}`}
                        className={cn('inline-flex h-8 items-center gap-1.5 rounded-item border px-3 text-body font-semibold transition-all hover:scale-105 active:scale-95', style.bg, style.text)}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {railMarks.length > 0 && <ScrollRail marks={railMarks} lectureEnd={lectureEnd} onGo={goToSegment} />}
      </div>

      {selectedSegmentId && !isCapture && (
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-meta font-semibold text-text-muted">Tag:</span>
            {(['confused', 'key-point', 'question'] as const).map((label) => {
              const style = TAG_STYLES[label]
              const Icon = style.icon
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleTag(label)}
                  title={`Mark this moment as ${label}`}
                  className={cn('inline-flex h-8 items-center gap-1.5 rounded-item border px-3 text-body font-semibold transition-all hover:scale-105 active:scale-95', style.bg, style.text)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              )
            })}
          </div>
          <div className="flex gap-1.5">
            <input
              value={annotationDraft}
              onChange={(e) => setAnnotationDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnnotation()}
              placeholder="Add a note..."
              className="h-9 flex-1 rounded-control border border-border bg-surface-raised px-3 text-body text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line"
            />
            <button
              onClick={handleAnnotation}
              disabled={!annotationDraft.trim()}
              className="h-9 rounded-control border border-border bg-surface-raised px-3.5 text-body font-medium text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
