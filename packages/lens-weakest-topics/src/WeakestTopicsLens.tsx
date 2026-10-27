import { useEffect, useRef, useState } from 'react'
import type { WeakTopic } from '@pls/substrate'
import { type LensProps, useSubstrate } from '@pls/lens-framework'
import { cn, EmptyState, HiddenElsewhere, COURSE_PILL_COLORS, formatTime } from '@pls/shared-ui'
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
        <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-600">
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

interface TopicRowProps {
  topic: WeakTopic
  showCourse: boolean
  state?: MomentState
  canShow: boolean
  onShow: () => void
}

function TopicRow({ topic, showCourse, state, canShow, onShow }: TopicRowProps) {
  const pillStyle = COURSE_PILL_COLORS[topic.course] ?? 'bg-neutral-700/50 text-neutral-500 ring-neutral-700'
  const where = `${lectureName(topic.recordingTitle)} · ${formatTime(topic.offsetMs)}`
  const linkButton = 'inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline'

  // Keep where the click went in view, even for a row low in a short panel.
  const messageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (state && state !== 'shown') messageRef.current?.scrollIntoView({ block: 'nearest' })
  }, [state])

  const body = (
    <>
      <span className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold',
        topic.rank <= 3 ? 'bg-amber-200/10 text-attention-strong' : 'bg-neutral-800 text-neutral-600',
      )}>
        {topic.rank}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-2 text-[13px] text-neutral-300">{topic.label}</span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          {showCourse && (
            <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize ring-1', pillStyle)}>
              {topic.course}
            </span>
          )}
          <span className="min-w-0 break-words text-[10px] text-neutral-500">{where}</span>
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
          className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-overlay/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
        >
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-lg px-2.5 py-2" title={where}>{body}</div>
      )}

      {state && state !== 'shown' && (
        <div ref={messageRef} data-testid="weak-topic-moment" className="ml-11 flex flex-col gap-1 pb-1.5 text-[11px] text-text-muted">
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
      <span className="flex shrink-0 items-center gap-1 text-[10px] text-attention" title="You marked this confusing">
        <CircleHelp className="h-3 w-3" />
        Confusing
      </span>
    )
  }
  const sure = topic.confidence
  return (
    <span
      className="flex w-[4.5rem] shrink-0 flex-col items-end gap-0.5"
      title={topic.confused ? `You felt ${sure}% sure, and marked it confusing` : `You felt ${sure}% sure`}
    >
      <span className="font-mono text-[11px] font-bold tabular-nums text-attention">{sure}% sure</span>
      <span className="flex h-1 w-full gap-px" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={cn('flex-1 rounded-sm', i < Math.round(sure / 20) ? 'bg-amber-200/50' : 'bg-neutral-800')} />
        ))}
      </span>
    </span>
  )
}
