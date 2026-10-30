import { useEffect, useRef, useState } from 'react'
import type { WeakTopic } from '@pls/substrate'
import { type LensProps, useSubstrate } from '@pls/lens-framework'
import { cn, courseTone, EmptyState, HiddenElsewhere, formatTime } from '@pls/shared-ui'
import { ArrowUpRight, CircleHelp } from 'lucide-react'

const LIMIT = 8

/** Where clicking a topic took the student: `nowhere` when no board has a Transcript. */
type MomentState = 'opening' | 'shown' | 'nowhere' | 'failed'

/** "Biology Lecture: Mitochondrial DNA" -> "Mitochondrial DNA" (the course pill already says Biology). */
export function lectureName(title: string): string {
  return title.replace(/^[^:]{0,40}\blecture:\s*/i, '') || title
}

export default function WeakestTopicsLens({ scope, onShowMoment }: LensProps) {
  const substrate = useSubstrate()
  const { data: topics } = substrate.useWeakestTopics(scope, LIMIT)
  // True totals (the list is capped): the same per-course "to review" counts
  // Your Progress and All courses show, so the three always agree.
  const { data: progress } = substrate.useWeeklyOverview(scope)
  const { data: allProgress } = substrate.useWeeklyOverview({})
  const toReview = (rows: typeof progress) => (rows ?? []).reduce((sum, c) => sum + c.reviewMoments, 0)
  const total = Math.max(toReview(progress), topics?.length ?? 0)
  const hidden = <HiddenElsewhere scopedCount={toReview(progress)} unscopedCount={toReview(allProgress)} />

  // One row at a time shows where its moment went.
  const [opened, setOpened] = useState<{ segmentId: string; state: MomentState } | null>(null)

  if (!topics?.length) {
    return <EmptyState message="Nothing to review. Mark a moment confusing and it shows up here." action={hidden} />
  }

  const show = async (topic: WeakTopic) => {
    if (!onShowMoment) return
    setOpened({ segmentId: topic.segmentId, state: 'opening' })
    let state: MomentState
    try {
      const result = await onShowMoment({ recordingId: topic.recordingId, offsetMs: topic.offsetMs })
      state = result === 'no-viewer' ? 'nowhere' : result
    } catch {
      state = 'failed'
    }
    setOpened((o) => (o?.segmentId === topic.segmentId ? { segmentId: topic.segmentId, state } : o))
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <span className="text-meta font-semibold text-text-muted">
          {total > topics.length ? `Weakest ${topics.length} of ${total} to review` : `${total} to review`}
        </span>
        {hidden}
      </div>

      <ul className="-mx-3 min-h-0 flex-1 space-y-1 overflow-y-auto px-3" aria-label="Weak topics">
        {topics.map((topic) => (
          <TopicRow
            key={`${topic.segmentId}-${topic.course}`}
            topic={topic}
            showCourse={!scope.courseTag}
            state={opened?.segmentId === topic.segmentId ? opened.state : undefined}
            canShow={!!onShowMoment}
            onShow={() => void show(topic)}
          />
        ))}
      </ul>
    </div>
  )
}

/**
 * Scrolls `el` into view within the topic list only. Not `scrollIntoView`,
 * which also scrolls the board: a row remounted while the shell glides the
 * board to the Transcript (the list refetches when the moment changes the
 * board's course) would stop that glide.
 */
function scrollIntoList(el: HTMLElement) {
  const list = el.closest('ul')
  if (!list) return
  const l = list.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  if (r.bottom > l.bottom) list.scrollTop += r.bottom - l.bottom
  else if (r.top < l.top) list.scrollTop -= l.top - r.top
}

interface TopicRowProps {
  topic: WeakTopic
  showCourse: boolean
  state?: MomentState
  canShow: boolean
  onShow: () => void
}

function TopicRow({ topic, showCourse, state, canShow, onShow }: TopicRowProps) {
  const tone = courseTone(topic.course)
  const where = `${lectureName(topic.recordingTitle)} · ${formatTime(topic.offsetMs)}`
  const linkButton = 'inline-flex items-center gap-1 text-meta font-semibold text-accent hover:underline'

  // Keep where the click went in view, even for a row low in a short panel.
  const messageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (state && state !== 'shown' && messageRef.current) scrollIntoList(messageRef.current)
  }, [state])

  const body = (
    <>
      <span className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-item text-meta font-semibold tabular-nums',
        topic.rank <= 3 ? 'bg-attn-soft text-attn' : 'bg-surface-overlay text-text-muted',
      )}>
        {topic.rank}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-2 text-body font-medium text-text-primary">{topic.label}</span>
        <span className="mt-0.5 min-w-0 break-words text-meta text-text-muted">
          {showCourse && (
            <>
              <span aria-hidden className={cn('mr-1.5 inline-block h-2 w-2 rounded-full', tone.stripe)} />
              <span className={cn('font-semibold capitalize', tone.ink)}>{topic.course}</span>
              {' · '}
            </>
          )}
          {where}
        </span>
      </span>

      <Sureness topic={topic} />
    </>
  )

  return (
    <li data-testid="weak-topic" data-segment-id={topic.segmentId}>
      {canShow ? (
        <button
          type="button"
          onClick={onShow}
          title={`Go to this moment: ${where}`}
          aria-label={`${topic.label}: go to this moment in ${where}`}
          className="group flex w-full items-center gap-3 rounded-item px-2.5 py-2 text-left transition-colors hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-item px-2.5 py-2" title={where}>{body}</div>
      )}

      {state && state !== 'shown' && (
        <div ref={messageRef} data-testid="weak-topic-moment" className="ml-12 flex flex-col gap-1 pb-1.5 text-meta text-text-muted">
          {state === 'opening' && <span>Opening the moment...</span>}
          {state === 'failed' && (
            <>
              <span>Couldn't open the moment just now.</span>
              <button type="button" onClick={onShow} className={cn(linkButton, 'self-start')}>
                Try again
                <ArrowUpRight className="h-3 w-3" />
              </button>
            </>
          )}
          {state === 'nowhere' && (
            <span>None of your boards has a Transcript yet. Add one from the widget drawer to see this moment.</span>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * "How sure you feel": the latest rating, or that it was marked confusing and
 * not rated since. Calm colours only: a weak topic is something to look at
 * again, not a failure.
 */
function Sureness({ topic }: { topic: WeakTopic }) {
  if (topic.confidence == null) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-meta font-semibold text-attn" title="You marked this confusing">
        <CircleHelp className="h-3.5 w-3.5" />
        Confusing
      </span>
    )
  }
  const sure = topic.confidence
  return (
    <span
      data-testid="weak-topic-sureness"
      className="flex w-[4.5rem] shrink-0 flex-col items-end gap-1"
      title={topic.confused ? `You felt ${sure}% sure, and marked it confusing` : `You felt ${sure}% sure`}
    >
      <span className="text-meta font-semibold tabular-nums text-attn">{sure}% sure</span>
      <span className="flex h-1 w-full gap-0.5" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={cn('flex-1 rounded-full', i < Math.round(sure / 20) ? 'bg-attn' : 'bg-surface-overlay')} />
        ))}
      </span>
    </span>
  )
}
