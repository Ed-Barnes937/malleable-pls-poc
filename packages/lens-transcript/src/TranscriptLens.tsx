import { useState, useMemo, useEffect, useRef } from 'react'
import { LECTURE_SUMMARY_ANCHOR, type PlanItemOccurrence, type Tag } from '@pls/substrate'
import { type LensProps, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { cn, COURSES, courseTone, dayAndTime, EmptyState, formatTime, TagPill, TAG_STYLES } from '@pls/shared-ui'
import { AudioLines, CalendarCheck, CalendarClock, ListTodo, MessageSquare, Sparkles } from 'lucide-react'
import { segmentAtOffset } from './moments'

/** What happened to the review a marked moment turned into, in a few words. */
function ReviewChip({ review }: { review: PlanItemOccurrence }) {
  const minutes = review.duration_min ? `${review.duration_min} min` : null
  const done = review.status === 'done'
  const Icon = done ? CalendarCheck : review.starts_at ? CalendarClock : ListTodo
  const when = done
    ? 'Reviewed'
    : review.starts_at
      ? `Review planned ${dayAndTime(review.starts_at)}`
      : 'Review on your to-do list'
  return (
    <span
      data-testid="review-chip"
      title={review.title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-meta font-semibold',
        done ? 'border-transparent bg-good-soft text-good' : 'border-attn-line bg-attn-soft text-attn',
      )}
    >
      <Icon className="h-3 w-3" />
      {[when, minutes].filter(Boolean).join(' · ')}
    </span>
  )
}

/** Space kept above a shown moment too tall to centre. */
const MOMENT_TOP_GAP = 8

/** A calm note that the lecture's AI work is still under way. */
function InProgress({ icon: Icon, message, testId }: { icon: typeof Sparkles; message: string; testId: string }) {
  return (
    <p role="status" data-testid={testId} className="flex items-center gap-1.5 text-body text-text-secondary">
      <Icon className="h-3.5 w-3.5 shrink-0 text-accent motion-safe:animate-pulse" />
      {message}
    </p>
  )
}

export default function TranscriptLens({ scope, config, focusedMoment, onMomentShown }: LensProps) {
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

  // A moment another widget asked to show (e.g. a calendar study block that
  // came from this lecture): scroll to its segment and highlight it, once per
  // request, once this lecture's segments, tags and notes have loaded (they
  // set the row heights the scroll position depends on).
  const [momentSegmentId, setMomentSegmentId] = useState<string | null>(null)
  const handledMomentId = useRef<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focusedMoment || focusedMoment.id === handledMomentId.current) return
    if (focusedMoment.recordingId !== recordingId) return
    const own = segments?.filter((s) => s.recording_id === recordingId)
    if (!own?.length || !tags || !annotations) return
    handledMomentId.current = focusedMoment.id
    setMomentSegmentId(segmentAtOffset(own, focusedMoment.offsetMs)?.id ?? null)
    setSelectedSegmentId(null)
    onMomentShown?.(focusedMoment.id)
  }, [focusedMoment, recordingId, segments, tags, annotations, onMomentShown])
  useEffect(() => {
    const list = listRef.current
    const el = momentSegmentId ? list?.querySelector<HTMLElement>(`[data-segment-id="${momentSegmentId}"]`) : null
    if (!list || !el) return
    // Scroll only the transcript list (scrollIntoView could also shift the
    // board). Centre the moment, unless it is taller than the list: then show
    // it from its first line.
    const top = el.clientHeight > list.clientHeight
      ? el.offsetTop - MOMENT_TOP_GAP
      : el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2
    list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [momentSegmentId])

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

  // The lecture's course: the board's course, else the one its reviews were
  // filed under. Unknown: accent instead of course colours.
  const course = scope.courseTag ?? reviews?.find((r) => r.course)?.course ?? null
  const tone = course ? courseTone(course) : null
  const courseLabel = course ? (COURSES.find((c) => c.value === course)?.label ?? course) : null

  const reviewByOffset = useMemo(() => {
    const map = new Map<number, PlanItemOccurrence>()
    for (const review of reviews ?? []) {
      if (review.source_offset_ms != null && !map.has(review.source_offset_ms)) map.set(review.source_offset_ms, review)
    }
    return map
  }, [reviews])

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
          className="max-h-[40%] shrink-0 overflow-y-auto rounded-item bg-surface-inset px-3.5 py-2.5"
        >
          <p className="mb-1 flex items-center gap-1.5 text-meta font-semibold text-text-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Summary
          </p>
          <ul className="space-y-0.5">
            {summaryLines.map((line, i) => (
              <li key={i} className="text-body text-text-secondary">{line}</li>
            ))}
          </ul>
        </section>
      )}

      <div ref={listRef} hidden={transcribing} className="relative -mx-3 min-h-0 flex-1 space-y-px overflow-y-auto px-3">
        {segments?.map((seg) => {
          const segTags = tagsBySegment.get(seg.id) ?? []
          const review = reviewByOffset.get(seg.start_ms)
          const segAnnotations = annotationsBySegment.get(seg.id) ?? []
          const isSelected = selectedSegmentId === seg.id
          const isMoment = momentSegmentId === seg.id

          return (
            <div key={seg.id} data-segment-id={seg.id} data-moment={isMoment || undefined}>
              <button
                onClick={() => {
                  setMomentSegmentId(null)
                  setSelectedSegmentId(isSelected ? null : seg.id)
                }}
                aria-current={isMoment ? 'location' : undefined}
                className={cn(
                  'group flex w-full gap-3 rounded-item border px-2.5 py-2 text-left transition-all',
                  isSelected || isMoment
                    ? tone ? cn(tone.soft, tone.stripeBorder) : 'border-accent bg-accent-soft'
                    : 'border-transparent hover:bg-surface-inset',
                  // A shown moment also gets a soft halo, so it reads as "you landed here".
                  isMoment && !isSelected && cn('ring-4', tone ? tone.ring : 'ring-accent-line'),
                )}
              >
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
                  {(segTags.length > 0 || review) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {segTags.map((tag) => <TagPill key={tag.id} label={tag.label} />)}
                      {review && <ReviewChip review={review} />}
                    </div>
                  )}
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

              {isSelected && isCapture && (
                <div className="ml-[3.625rem] flex items-center gap-1 py-1.5">
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
