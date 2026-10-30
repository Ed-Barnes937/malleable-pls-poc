import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LECTURE_SUMMARY_ANCHOR, segmentAtOffset, type Lecture, type PlanItemOccurrence, type Tag } from '@pls/substrate'
import { type LensProps, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { cn, COURSES, courseTone, dayAndTime, EmptyState, formatTime, fromMomentLabel, leadingTag, prefersReducedMotion, showOnBoard, TagPill, TAG_STYLES, useArrivals, watchUserScroll } from '@pls/shared-ui'
import { ArrowRight, AudioLines, CalendarCheck, CalendarClock, ChevronRight, Clock, ListTodo, MessageSquare, Sparkles } from 'lucide-react'
import { ScrollRail } from './ScrollRail'

/** What happened to the review a marked moment turned into, in a few words; a planned one links to its block. */
function ReviewChip({ review, onShow }: { review: PlanItemOccurrence; onShow?: (chip: HTMLElement) => void }) {
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
      onClick={(e) => onShow(e.currentTarget)}
      className={cn(className, 'text-left transition-colors hover:border-attn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-attn')}
    >
      <Icon className="h-3 w-3" />
      {label}
      <ArrowRight className="h-3 w-3" aria-hidden />
    </button>
  )
}

const LIFT_OFF_WIDTH_PX = 256
/** From the moment the review arrives until its card lands (and the block glows). */
const RIPPLE_MS = 1300
/** The first part of that: the card rises off the moment before it flies. */
const LIFT_MS = 280
/** How long to wait for a new to-do row to reach the list. */
const TODO_ROW_WAIT_MS = 2000

/** Scrolls `list` (only) just enough to show `el`, without gliding: the card starts from where it now is. */
function scrollWithin(list: HTMLElement, el: Element) {
  const l = list.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  if (r.bottom > l.bottom - 4) list.scrollTop += r.bottom - l.bottom + MOMENT_TOP_GAP
  else if (r.top < l.top) list.scrollTop -= l.top - r.top + MOMENT_TOP_GAP
}

/** The review's row in the board's To-do list, once it is there. */
function todoRow(review: PlanItemOccurrence): Element | null {
  return document.querySelector(`[data-testid="todo-item"][data-plan-item-id="${CSS.escape(review.id)}"]`)
}

/**
 * Where the card is headed, looked up each frame (the board and the calendar
 * scroll while it flies): the review's Calendar block, or with no Calendar
 * on the board, its To-do row.
 */
function rippleTarget(review: PlanItemOccurrence, toCalendar: boolean): Element | null {
  return toCalendar
    ? document.querySelector(`[data-testid="calendar-block"][data-plan-item-id="${CSS.escape(review.id)}"]`) ?? document.querySelector('[data-testid="calendar"]')
    : todoRow(review) ?? document.querySelector('ul[aria-label="To-dos"]')
}

/** Roughly the card's height, to keep it on screen from its first frame. */
const LIFT_OFF_HEIGHT_PX = 76

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/**
 * The ripple of marking a moment confusing, once per new review. The moment
 * scrolls its review chip into view; the board follows the review to its
 * Calendar block (or, with no Calendar on the board or no time found, its
 * To-do row), keeping the moment in view too when both fit, unless the
 * student scrolls the board meanwhile; and the one signature motion: a card
 * lifts off the visible part of the moment and flies there, and the block
 * glows as it lands. No card when the board has neither widget, or under
 * reduced motion (the board jumps).
 */
function Ripple({ review, recordingTitle, reducedMotion, markedAt, onShowPlanItem, onDone }: {
  review: PlanItemOccurrence
  recordingTitle: string
  reducedMotion: boolean
  /** When the student last marked a moment (a `watchUserScroll` mark): their own scrolling since then wins. */
  markedAt: number | null
  onShowPlanItem?: LensProps['onShowPlanItem']
  onDone: (id: string) => void
}) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const since = useRef(0)
  const chipRef = useRef<Element | null>(null)
  const [flight, setFlight] = useState<{ left: number; top: number } | null>(null)
  const tone = courseTone(review.course)
  // The shell offers to show a block only on a board with a Calendar.
  const toCalendar = !!review.starts_at && !!onShowPlanItem

  useLayoutEffect(() => {
    if (started.current) return
    started.current = true
    since.current = Math.min(watchUserScroll(), markedAt ?? Infinity)
    const moment = anchorRef.current?.closest<HTMLElement>('[data-segment-id]')
    const list = moment?.parentElement
    if (!moment || !list) return
    const chip = moment.querySelector('[data-testid="review-chip"]')
    chipRef.current = chip
    if (chip) scrollWithin(list, chip)
    if (toCalendar) {
      // Next frame, so the Calendar's work doesn't hold up this one (the card's first).
      const item = { id: review.id, startsAt: review.starts_at!, keepInView: chip, landsInMs: reducedMotion ? 0 : RIPPLE_MS, scrolledSince: since.current }
      requestAnimationFrame(() => onShowPlanItem?.(item))
    }
    if (reducedMotion || !rippleTarget(review, toCalendar)) return
    // From the part of the moment that is on screen: inside the list and the
    // board's view, even if the moment has been scrolled away.
    const m = moment.getBoundingClientRect()
    const l = list.getBoundingClientRect()
    const b = list.closest('[data-canvas-scroll]')?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight)
    const viewTop = Math.max(b.top, 0)
    const viewBottom = Math.min(b.bottom, window.innerHeight) - LIFT_OFF_HEIGHT_PX
    const highest = Math.max(l.top, viewTop)
    const lowest = Math.min(l.bottom - LIFT_OFF_HEIGHT_PX, viewBottom)
    const top = highest <= lowest
      ? Math.min(Math.max(m.top, highest), Math.max(highest, m.bottom - 40), lowest)
      // The list is (almost) off screen: from the board's edge nearest it.
      : l.top >= viewBottom ? Math.max(viewTop, viewBottom) : viewTop
    setFlight({ left: Math.max(b.left, Math.min(m.right, l.right) - LIFT_OFF_WIDTH_PX - 8), top })
  }, [review, onShowPlanItem, reducedMotion, markedAt, toCalendar])

  // The new To-do row, once it is there: in full view in its list, and when
  // the board isn't following the Calendar, on screen too.
  useEffect(() => {
    const until = performance.now() + TODO_ROW_WAIT_MS
    let frame = 0
    const look = () => {
      const row = todoRow(review)
      if (!row) {
        if (performance.now() < until) frame = requestAnimationFrame(look)
        return
      }
      const list = row.closest('ul')
      if (list) scrollWithin(list, row)
      if (toCalendar) return
      const chip = chipRef.current?.isConnected ? chipRef.current.getBoundingClientRect() : null
      showOnBoard(row, row.getBoundingClientRect(), { keep: [chip], since: since.current, smooth: !reducedMotion })
    }
    frame = requestAnimationFrame(look)
    return () => cancelAnimationFrame(frame)
  }, [review, reducedMotion, toCalendar])

  // The card: rises, then flies to wherever its target is now.
  useEffect(() => {
    const card = cardRef.current
    if (!flight || !card) return
    const t0 = performance.now()
    let frame = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / RIPPLE_MS)
      const lift = Math.min(1, (now - t0) / LIFT_MS)
      const fly = easeInOut(Math.max(0, (now - t0 - LIFT_MS) / (RIPPLE_MS - LIFT_MS)))
      const box = rippleTarget(review, toCalendar)?.getBoundingClientRect()
      const fromX = flight.left + LIFT_OFF_WIDTH_PX / 2
      const fromY = flight.top + card.offsetHeight / 2
      const dx = box ? box.left + box.width / 2 - fromX : 160
      const dy = box ? box.top + Math.min(box.height / 2, 40) - fromY : 0
      const scale = 1 - 0.12 * fly
      card.style.opacity = String(t > 0.85 ? (1 - t) / 0.15 : lift)
      card.style.transform = `translate(${dx * fly}px, ${dy * fly - 6 * lift}px) rotate(${-2 * lift}deg) scale(${scale})`
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [flight, review, toCalendar])

  // Gone after its run, even if the animation never ends (e.g. a hidden tab).
  useEffect(() => {
    // Long enough for the card and for the new To-do row to arrive.
    const t = setTimeout(() => onDone(review.id), Math.max(RIPPLE_MS + 100, TODO_ROW_WAIT_MS))
    return () => clearTimeout(t)
  }, [onDone, review.id])

  return (
    <>
      <span ref={anchorRef} aria-hidden className="pointer-events-none absolute right-2 top-1" />
      {flight && createPortal(
        // Drawn over the whole page: the transcript list would clip it.
        <div
          ref={cardRef}
          aria-hidden
          data-testid="review-lift-off"
          className={cn(
            'pointer-events-none fixed z-50 rounded-item border-l-4 bg-surface-raised px-3 py-2 opacity-0 shadow-pop will-change-transform motion-reduce:hidden',
            tone.stripeBorder,
          )}
          style={{ left: flight.left, top: flight.top, width: LIFT_OFF_WIDTH_PX }}
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

/** How many recent lectures "Pick a lecture" offers as one-click choices. */
const RECENT_LECTURES = 5

/**
 * No lecture on the board: the course's (or every course's) latest lectures
 * as one-click choices, so the student never has to find the picker.
 */
function PickALecture({ courseTag, onPick }: { courseTag?: string; onPick?: (lectureId: string) => void }) {
  const { data: lectures } = useSubstrate().useLectures({ courseTag })
  const recent = (lectures ?? []).slice(0, RECENT_LECTURES)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <EmptyState message="Pick a lecture to see its transcript" />
      {onPick && recent.length > 0 && (
        <ul aria-label="Recent lectures" className="flex w-full max-w-xs flex-col gap-1">
          {recent.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => onPick(l.id)}
                className="flex w-full items-center gap-2 rounded-item bg-surface-raised px-3 py-2 text-left text-body text-text-primary ring-1 ring-border-subtle transition-colors hover:bg-surface-inset hover:ring-accent-line"
              >
                <AudioLines className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 truncate">{l.title}</span>
                {l.recordings.length === 0 && <span className="shrink-0 text-meta text-text-muted">No recording yet</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A lecture recorded in more than one go: which part the transcript shows. */
function PartPicker({ lecture, partId, onPick }: { lecture: Lecture; partId: string; onPick: (id: string) => void }) {
  return (
    <div role="group" aria-label="Lecture parts" className="flex flex-wrap items-center gap-1">
      {lecture.recordings.map((r, i) => (
        <button
          key={r.id}
          type="button"
          aria-pressed={r.id === partId}
          title={r.title}
          onClick={() => onPick(r.id)}
          className={cn(
            'h-7 rounded-full px-2.5 text-meta font-semibold transition-colors',
            r.id === partId ? 'bg-accent-soft text-accent' : 'text-text-secondary hover:bg-surface-inset',
          )}
        >
          Part {i + 1}
        </button>
      ))}
    </div>
  )
}

/** A calm note that the lecture's AI work is still under way. */
function InProgress({ icon: Icon, message, testId }: { icon: typeof Sparkles; message: string; testId: string }) {
  return (
    <p role="status" data-testid={testId} className="flex items-center gap-1.5 text-body text-text-secondary">
      <Icon className="h-3.5 w-3.5 shrink-0 text-accent motion-safe:animate-pulse" />
      {message}
    </p>
  )
}

export default function TranscriptLens({ scope, config, focusedMoment, onMomentShown, onShowPlanItem, onScopeChange }: LensProps) {
  const substrate = useSubstrate()
  const mutations = useSubstrateMutations()

  // The board's lecture, and which of its recordings (parts, oldest first)
  // is shown: the one a moment asks for, else the student's pick, else the
  // latest.
  const lectureId = scope.lectureId
  const { data: lectureData } = substrate.useLecture(lectureId)
  // A capture into this lecture in progress (the Record widget), if any.
  const liveCapture = substrate.useLiveCapture(lectureId)
  const lecture = lectureId && lectureData?.id === lectureId ? lectureData : undefined
  const [pickedPart, setPickedPart] = useState<string | null>(null)
  useEffect(() => setPickedPart(null), [lectureId])
  useEffect(() => {
    if (focusedMoment && lecture?.recordings.some((r) => r.id === focusedMoment.recordingId)) {
      setPickedPart(focusedMoment.recordingId)
    }
  }, [focusedMoment, lecture])
  const recordingId = (lecture?.recordings.find((r) => r.id === pickedPart) ?? lecture?.recordings.at(-1))?.id ?? ''
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
  const transcribe = mutations.useTranscribeRecording()

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
  // its moment) gets the ripple once; reviews already there never do.
  const arrived = useArrivals(reviews?.map((r) => r.id), recordingId)
  const [landedIds, setLandedIds] = useState<ReadonlySet<string>>(() => new Set())
  const reducedMotion = useMemo(prefersReducedMotion, [])
  const landed = useCallback((id: string) => setLandedIds((ids) => new Set([...ids, id])), [])

  // Until the transcript lands there is nothing to show but that it's coming.
  const transcribing = recording?.processing === 'transcribing' && !segments?.length
  const summarising = recording?.processing === 'summarising'
  // Never transcribed (status stays 'uploaded' until a run finishes, so a
  // lecture that was transcribed but said nothing is not this) and nothing on
  // its way: no automation ran (e.g. the student deleted the transcribe one,
  // or the run failed), so say so and offer it.
  const untranscribed = !!recording && !!segments && segments.length === 0 && recording.status !== 'ready' && !recording.processing && !isCapture

  /** When the student last marked a moment: the ripple that follows leaves the board alone if they scroll after it. */
  const markedAt = useRef<number | null>(null)
  const handleTag = (label: string) => {
    if (!selectedSegmentId) return
    markedAt.current = watchUserScroll()
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

  if (!lectureId) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <PickALecture courseTag={scope.courseTag} onPick={onScopeChange && ((id) => onScopeChange({ lectureId: id }))} />
      </div>
    )
  }

  if (lecture && lecture.recordings.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <span data-testid="lecture-title" className="truncate text-title font-semibold text-text-primary">{lecture.title}</span>
        <div className="flex flex-1 items-center justify-center">
          {liveCapture === 'recording'
            ? <InProgress icon={AudioLines} message="Recording..." testId="recording-live" />
            : liveCapture === 'saving'
              ? <InProgress icon={AudioLines} message="Saving the recording..." testId="recording-saving" />
              : <EmptyState icon={AudioLines} message="No recording yet" />}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span data-testid="lecture-title" className="truncate text-title font-semibold text-text-primary">
          {lecture?.title ?? recording?.title ?? 'Loading...'}
        </span>
        {tone && courseLabel && (
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-meta font-semibold', tone.tint, tone.ink)}>
            {courseLabel}
          </span>
        )}
        {recording && segments && !transcribing && !untranscribed && (
          <span className="ml-auto shrink-0 text-meta text-text-muted tabular-nums">
            {segments.length} segments
          </span>
        )}
      </div>

      {lecture && liveCapture && (
        <InProgress
          icon={AudioLines}
          message={liveCapture === 'recording'
            ? `Recording part ${lecture.recordings.length + 1}...`
            : `Saving part ${lecture.recordings.length + 1}...`}
          testId={liveCapture === 'recording' ? 'recording-live' : 'recording-saving'}
        />
      )}

      {lecture && lecture.recordings.length > 1 && (
        <PartPicker lecture={lecture} partId={recordingId} onPick={setPickedPart} />
      )}

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

      {untranscribed && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-center">
          <p data-testid="untranscribed" className="text-body text-text-secondary">This lecture isn't transcribed yet.</p>
          <button
            type="button"
            disabled={transcribe.isPending}
            onClick={() => transcribe.mutate({ recordingId })}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-control bg-accent px-4 text-body font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <AudioLines className="h-4 w-4" />
            Transcribe it
          </button>
        </div>
      )}

      {summarising && summaryLines.length === 0 && (
        <section aria-label="Lecture summary" className="rounded-item bg-surface-inset px-3.5 py-2.5">
          <InProgress icon={Sparkles} message="Writing your summary..." testId="summarising" />
        </section>
      )}

      <div hidden={transcribing || untranscribed} className="flex min-h-0 flex-1 gap-1.5">
      <div ref={listRef} className="relative -ml-3 min-h-0 flex-1 space-y-px overflow-y-auto pl-3 pr-1">
        {summaryLines.length > 0 && (
          <section
            aria-label="Lecture summary"
            // The head of the transcript, scrolling with it: open, it shows
            // every line and the moments follow it, so even in a short widget
            // it never covers them.
            className={cn('mb-2 rounded-item bg-surface-inset px-3.5', summaryOpen ? 'py-2.5' : 'py-2')}
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
                aria-controls={summaryOpen ? `summary-${recordingId}` : undefined}
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
                        ? (chip) => onShowPlanItem({ id: review.id, startsAt: review.starts_at!, keepInView: chip })
                        : undefined}
                    />
                  )}
                </div>
              )}
              {review && arrived.has(review.id) && !landedIds.has(review.id) && (
                <Ripple
                  review={review}
                  recordingTitle={recording?.title ?? 'this lecture'}
                  reducedMotion={reducedMotion}
                  markedAt={markedAt.current}
                  onShowPlanItem={onShowPlanItem}
                  onDone={landed}
                />
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
