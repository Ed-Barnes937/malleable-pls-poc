import { useState, useMemo, useEffect, useRef } from 'react'
import { LECTURE_SUMMARY_ANCHOR, type PlanItemOccurrence, type Tag } from '@pls/substrate'
import { type LensProps, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { cn, EmptyState, formatTime, TagPill, TAG_STYLES } from '@pls/shared-ui'
import { CalendarCheck, CalendarClock, ListTodo, MessageSquare, Sparkles } from 'lucide-react'
import { segmentAtOffset } from './moments'

const REVIEW_TIME = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/** What happened to the review a marked moment turned into, in a few words. */
function ReviewChip({ review }: { review: PlanItemOccurrence }) {
  const minutes = review.duration_min ? `${review.duration_min} min` : null
  const done = review.status === 'done'
  const Icon = done ? CalendarCheck : review.starts_at ? CalendarClock : ListTodo
  const when = done
    ? 'Reviewed'
    : review.starts_at
      ? `Review planned ${REVIEW_TIME.format(new Date(review.starts_at))}`
      : 'Review on your to-do list'
  return (
    <span
      data-testid="review-chip"
      title={review.title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1',
        done ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' : 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {[when, minutes].filter(Boolean).join(' · ')}
    </span>
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
    // Scroll only the transcript list (scrollIntoView could also shift the board).
    const top = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2
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

  const reviewByOffset = useMemo(() => {
    const map = new Map<number, PlanItemOccurrence>()
    for (const review of reviews ?? []) {
      if (review.source_offset_ms != null && !map.has(review.source_offset_ms)) map.set(review.source_offset_ms, review)
    }
    return map
  }, [reviews])

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
        <span className="truncate text-[11px] font-medium text-neutral-400">
          {recording?.title ?? 'Loading...'}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-neutral-600">
          {segments?.length ?? 0} segments
        </span>
      </div>

      {summaryLines.length > 0 && (
        <section
          aria-label="Lecture summary"
          className="rounded-lg border border-accent/15 bg-accent/5 px-3 py-2"
        >
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-accent/80">
            <Sparkles className="h-3 w-3" />
            Summary
          </p>
          <ul className="space-y-0.5">
            {summaryLines.map((line, i) => (
              <li key={i} className="text-[12px] leading-snug text-neutral-300">{line}</li>
            ))}
          </ul>
        </section>
      )}

      <div ref={listRef} className="relative -mx-3 min-h-0 flex-1 space-y-px overflow-y-auto px-3">
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
                  'group flex w-full gap-3 rounded-lg px-2.5 py-2 text-left transition-all',
                  isSelected
                    ? 'bg-accent/8 ring-1 ring-accent/20'
                    : isMoment
                      ? 'bg-accent/10 ring-2 ring-accent/40'
                      : 'hover:bg-surface-overlay/50'
                )}
              >
                <span className={cn(
                  'shrink-0 pt-0.5 font-mono text-[11px] tabular-nums',
                  isSelected || isMoment ? 'text-accent' : 'text-neutral-600 group-hover:text-neutral-500'
                )}>
                  {formatTime(seg.start_ms)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-[13px] leading-relaxed', isSelected || isMoment ? 'text-neutral-200' : 'text-neutral-400')}>
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
                        <div key={ann.id} className="flex items-start gap-1.5 rounded-md bg-surface-overlay/40 px-2 py-1 text-[11px] text-neutral-500">
                          <MessageSquare className="mt-0.5 h-2.5 w-2.5 shrink-0 text-neutral-600" />
                          {ann.body}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </button>

              {isSelected && isCapture && (
                <div className="ml-[3.25rem] flex items-center gap-1 py-1.5">
                  {(['confused', 'key-point', 'question'] as const).map((label) => {
                    const style = TAG_STYLES[label]
                    const Icon = style.icon
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => handleTag(label)}
                        title={`Mark this moment as ${label}`}
                        className={cn('inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:scale-105 active:scale-95', style.bg, style.text)}
                      >
                        <Icon className="h-3 w-3" />
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
            <span className="text-[10px] text-neutral-600">Tag:</span>
            {(['confused', 'key-point', 'question'] as const).map((label) => {
              const style = TAG_STYLES[label]
              const Icon = style.icon
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleTag(label)}
                  title={`Mark this moment as ${label}`}
                  className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-all hover:scale-105 active:scale-95', style.bg, style.text)}
                >
                  <Icon className="h-2.5 w-2.5" />
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
              className="flex-1 rounded-md border border-border-subtle bg-surface px-2 py-1 text-xs text-neutral-300 placeholder:text-neutral-700 focus:border-accent/40 focus:outline-none"
            />
            <button
              onClick={handleAnnotation}
              disabled={!annotationDraft.trim()}
              className="rounded-md bg-surface-overlay px-2 py-1 text-xs text-neutral-400 transition-colors hover:text-neutral-200 disabled:opacity-30"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
