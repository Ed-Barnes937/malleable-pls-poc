import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { QUESTIONS, type Question } from '@pls/substrate'
import { type LensProps, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { Badge, type BadgeProps, cn, EmptyState, HiddenElsewhere, formatTime, useP2Variant, useP2FocusRun, endP2FocusRun, TAG_STYLES } from '@pls/shared-ui'
import { Check, X, Eye, ChevronRight, Timer, CircleCheck, Undo2, ArrowUpRight } from 'lucide-react'

/** PROTOTYPE (flow audit p2): what Test Me is asking about the moment just answered. */
type P2Ask = { kind: 'sort' | 'unsort'; segmentId: string }

/** PROTOTYPE (flow audit p2): a review moment with no written question - look at it again instead. */
type P2Card = Question & { conf: number; lookAgain?: { recordingId: string; offsetMs: number; recordingTitle: string } }

export default function TestMeLens({ scope, config, onShowMoment }: LensProps) {
  const substrate = useSubstrate()
  const mutations = useSubstrateMutations()

  const mode = (config.mode as string) ?? 'review'
  const timerSeconds = (config.timerSeconds as number) ?? 120
  const isExam = mode === 'exam'

  const { data: tags } = substrate.useTags(scope)
  const { data: confidence } = substrate.useConfidence(scope)
  const recordConfidence = mutations.useRecordConfidence()
  // PROTOTYPE (flow audit p2)
  const p2 = useP2Variant()
  const run = useP2FocusRun()
  const focused = p2 === 'c' && run !== null
  const createTag = mutations.useCreateTag()
  const deleteTag = mutations.useDeleteTag()
  const [ask, setAsk] = useState<P2Ask | null>(null)
  /** The moment just marked sorted here, for an Undo on the next card. */
  const [justSorted, setJustSorted] = useState<{ segmentId: string; question: string } | null>(null)
  const [runIndex, setRunIndex] = useState(0)
  const [runSorted, setRunSorted] = useState<Set<string>>(() => new Set())

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(timerSeconds)
  useEffect(() => {
    setRunIndex(0)
    setRunSorted(new Set())
    setAsk(null)
    setRevealed(false)
    setAnswer('')
    setJustSorted(null)
    // The chip may be in another widget, off screen on a phone: bring Test Me into view.
    if (run && p2 === 'c') rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.startedAt])
  const rootRef = useRef<HTMLDivElement>(null)

  // PROTOTYPE (flow audit p2): a sorted moment is no longer treated as confused.
  const sortedTagsBySegment = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const tag of tags ?? []) {
      if (tag.label === 'sorted' && tag.target_type === 'transcript_segment') {
        map.set(tag.target_id, [...(map.get(tag.target_id) ?? []), tag.id])
      }
    }
    return map
  }, [tags])
  const confusedSegmentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const tag of tags ?? []) {
      if (tag.label === 'confused' && tag.target_type === 'transcript_segment' && !sortedTagsBySegment.has(tag.target_id)) {
        ids.add(tag.target_id)
      }
    }
    return ids
  }, [tags, sortedTagsBySegment])

  const confidenceBySegment = useMemo(() => {
    const map = new Map<string, number>()
    for (const cs of confidence ?? []) {
      if (cs.target_type === 'transcript_segment') {
        const existing = map.get(cs.target_id)
        if (existing === undefined || cs.score < existing) {
          map.set(cs.target_id, cs.score)
        }
      }
    }
    return map
  }, [confidence])

  const courseQuestions = useMemo(
    () => (scope.courseTag ? QUESTIONS.filter((q) => q.course === scope.courseTag) : QUESTIONS),
    [scope.courseTag],
  )
  const hidden = <HiddenElsewhere scopedCount={courseQuestions.length} unscopedCount={QUESTIONS.length} />

  const sortedQuestions = useMemo(() => {
    const scored = courseQuestions.map((q) => {
      const isConfused = confusedSegmentIds.has(q.segmentId)
      const conf = confidenceBySegment.get(q.segmentId) ?? 50
      const priority = (isConfused ? 0 : 1000) + conf
      return { ...q, priority, conf }
    })
    scored.sort((a, b) => a.priority - b.priority)
    return scored
  }, [courseQuestions, confusedSegmentIds, confidenceBySegment])

  // PROTOTYPE (flow audit p2, variant C): the focused run's cards, in the
  // order the chip listed them; a moment with no written question is a
  // "look at it again" card.
  const runCards = useMemo((): P2Card[] => {
    if (!run) return []
    return run.items.map((item) => {
      const q = QUESTIONS.find((x) => x.segmentId === item.segmentId)
      const conf = confidenceBySegment.get(item.segmentId) ?? 50
      if (q) return { ...q, conf }
      return {
        id: `look-${item.segmentId}`,
        segmentId: item.segmentId,
        course: '',
        question: `Look again: ${item.label}`,
        answer: 'Open the moment, read it again, then say how it went.',
        difficulty: 'medium',
        conf,
        lookAgain: { recordingId: item.recordingId, offsetMs: item.offsetMs, recordingTitle: item.recordingTitle },
      } as P2Card
    })
  }, [run, confidenceBySegment])
  const runDone = focused && runIndex >= runCards.length

  // The course can change under us; never index past the filtered list.
  const currentQuestion: P2Card | undefined = focused
    ? runCards[runIndex]
    : sortedQuestions[sortedQuestions.length > 0 ? currentIndex % sortedQuestions.length : 0]
  const currentConfused = !!currentQuestion && confusedSegmentIds.has(currentQuestion.segmentId)
  const currentSorted = !!currentQuestion && sortedTagsBySegment.has(currentQuestion.segmentId)

  useEffect(() => {
    if (!isExam) return
    setTimeLeft(timerSeconds)
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [isExam, timerSeconds, currentIndex])

  const handleResult = useCallback((gotIt: boolean) => {
    if (!currentQuestion) return
    const newScore = gotIt
      ? Math.min(100, (currentQuestion.conf ?? 50) + 20)
      : Math.max(0, (currentQuestion.conf ?? 50) - 25)

    recordConfidence.mutate({
      target_type: 'transcript_segment',
      target_id: currentQuestion.segmentId,
      score: newScore,
      source_lens_id: 'test-me',
    })

    // PROTOTYPE (flow audit p2, variants B and C): ask before moving on.
    if (p2 !== 'a') {
      if (gotIt && currentConfused) return setAsk({ kind: 'sort', segmentId: currentQuestion.segmentId })
      if (!gotIt && currentSorted) return setAsk({ kind: 'unsort', segmentId: currentQuestion.segmentId })
    }
    next()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, recordConfidence, p2, currentConfused, currentSorted, focused, sortedQuestions.length])

  /** PROTOTYPE (flow audit p2): on to the next card. */
  function next(keepUndo = false) {
    if (!keepUndo) setJustSorted(null)
    setAsk(null)
    setAnswer('')
    setRevealed(false)
    if (focused) setRunIndex((i) => i + 1)
    else setCurrentIndex((i) => (i + 1) % sortedQuestions.length)
  }
  const answerAsk = (yes: boolean) => {
    if (ask && yes && ask.kind === 'sort') {
      createTag.mutate({ target_type: 'transcript_segment', target_id: ask.segmentId, label: 'sorted' })
      setRunSorted((ids) => new Set([...ids, ask.segmentId]))
      setJustSorted({ segmentId: ask.segmentId, question: currentQuestion?.question ?? 'that moment' })
      return next(true)
    }
    if (ask && yes && ask.kind === 'unsort') {
      for (const id of sortedTagsBySegment.get(ask.segmentId) ?? []) deleteTag.mutate(id)
    }
    next()
  }

  if (runDone && run) {
    return (
      <div data-testid="p2-run-done" className="flex h-full min-h-0 flex-col items-center justify-center gap-3 text-center">
        <CircleCheck className="h-8 w-8 text-good" />
        <p className="text-title font-semibold text-text-primary">Review done</p>
        <p className="text-body text-text-secondary">
          You went through {run.items.length} moment{run.items.length !== 1 ? 's' : ''} and sorted {runSorted.size}.
        </p>
        <button
          type="button"
          onClick={endP2FocusRun}
          className="inline-flex h-10 items-center justify-center rounded-control bg-accent px-4 text-body font-semibold text-accent-foreground hover:opacity-90"
        >
          Back to Test Me
        </button>
      </div>
    )
  }

  if (!currentQuestion) {
    return <EmptyState message="No questions available" action={hidden} />
  }

  const confidencePercent = currentQuestion.conf ?? 50
  const timerPercent = isExam ? (timeLeft / timerSeconds) * 100 : 0
  const lowOnTime = timeLeft < 30

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col gap-4">
      {isExam && (
        <div className="flex items-center gap-2">
          <Timer className={cn('h-4 w-4', lowOnTime ? 'text-confused' : 'text-text-muted')} />
          <div className="h-1.5 flex-1 rounded-full bg-surface-overlay">
            <div
              className={cn('h-full rounded-full transition-all duration-1000', lowOnTime ? 'bg-confused' : 'bg-accent')}
              style={{ width: `${timerPercent}%` }}
            />
          </div>
          <span className={cn('text-meta font-semibold tabular-nums', lowOnTime ? 'text-confused' : 'text-text-muted')}>
            {formatTime(timeLeft * 1000)}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {focused ? (
          <>
            <span data-testid="p2-run-header" className="rounded-full bg-attn-soft px-2.5 py-0.5 text-meta font-semibold text-attn">
              Moments to review · {runIndex + 1} of {runCards.length}
            </span>
            <button type="button" onClick={endP2FocusRun} className="text-meta font-semibold text-accent hover:underline">
              End review
            </button>
          </>
        ) : (
          <>
            <span className="text-meta font-semibold text-text-muted">
              {isExam ? 'Exam mode' : 'Review'}
            </span>
            <span className="flex items-center gap-2">
              {hidden}
              <span className="text-meta tabular-nums text-text-muted">
                {(currentIndex % sortedQuestions.length) + 1}/{sortedQuestions.length}
              </span>
            </span>
          </>
        )}
      </div>

      {/* PROTOTYPE (flow audit p2): the way back from a sort, until the next answer. */}
      {justSorted && (
        <div data-testid="p2-just-sorted" className={cn('flex items-center gap-2 rounded-item border px-3 py-1.5 text-meta', TAG_STYLES.sorted.bg)}>
          <CircleCheck className="h-3.5 w-3.5 shrink-0 text-good" />
          <span className="min-w-0 flex-1 truncate text-text-secondary">Sorted: {justSorted.question}</span>
          <button
            type="button"
            onClick={() => {
              for (const t of tags ?? []) {
                if (t.label === 'sorted' && t.target_id === justSorted.segmentId) deleteTag.mutate(t.id)
              }
              setRunSorted((ids) => new Set([...ids].filter((id) => id !== justSorted.segmentId)))
              setJustSorted(null)
            }}
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent hover:underline"
          >
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 overflow-y-auto">
        <div className="flex flex-col items-start gap-2 rounded-item bg-surface-inset p-4">
          <p className="text-title font-medium text-text-primary">{currentQuestion.question}</p>
          <span className="flex flex-wrap items-center gap-1.5">
            {!currentQuestion.lookAgain && (
              <Badge variant={DIFFICULTY_BADGE[currentQuestion.difficulty] ?? 'neutral'} className="capitalize">
                {currentQuestion.difficulty}
              </Badge>
            )}
            {/* PROTOTYPE (flow audit p2): the moment's state, so the student knows what answering can do. */}
            {currentConfused && (
              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-meta font-semibold', TAG_STYLES.confused.bg, TAG_STYLES.confused.text)}>
                You marked this confusing
              </span>
            )}
            {currentSorted && (
              <span data-testid="p2-testme-sorted" className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-meta font-semibold', TAG_STYLES.sorted.bg, TAG_STYLES.sorted.text)}>
                <CircleCheck className="h-3 w-3" /> Sorted
              </span>
            )}
            {currentQuestion.lookAgain && onShowMoment && (
              <button
                type="button"
                onClick={() => void onShowMoment({ recordingId: currentQuestion.lookAgain!.recordingId, offsetMs: currentQuestion.lookAgain!.offsetMs })}
                className="inline-flex items-center gap-1 text-meta font-semibold text-accent hover:underline"
              >
                Open at {formatTime(currentQuestion.lookAgain.offsetMs)}
                <ArrowUpRight className="h-3 w-3" />
              </button>
            )}
          </span>
        </div>

        {!revealed ? (
          <>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer..."
              aria-label="Your answer"
              className="resize-none rounded-control border border-border bg-surface-raised p-3 text-body text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line"
              rows={2}
            />
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-control border border-border bg-surface-raised px-4 text-body font-semibold text-text-primary transition-colors hover:bg-surface-overlay"
            >
              <Eye className="h-4 w-4" />
              Reveal answer
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1 rounded-item bg-good-soft p-3">
              <p className="text-meta font-semibold text-good">Answer</p>
              <p className="text-body text-text-primary">{currentQuestion.answer}</p>
            </div>
            {ask ? (
              <div data-testid="p2-ask" className={cn('flex flex-col gap-2 rounded-item border p-3', ask.kind === 'sort' ? TAG_STYLES.sorted.bg : 'border-border bg-surface-inset')}>
                <p className="text-body font-semibold text-text-primary">
                  {ask.kind === 'sort' ? 'Mark this moment sorted?' : 'Put this back on your review list?'}
                </p>
                <p className="text-meta text-text-secondary">
                  {ask.kind === 'sort'
                    ? 'It leaves your moments to review and gets no more reviews. It stays marked as once confusing.'
                    : 'You marked it sorted. It goes back to your moments to review.'}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => answerAsk(true)}
                    className={cn('inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-control text-body font-semibold text-white hover:opacity-90', ask.kind === 'sort' ? 'bg-good' : 'bg-accent')}
                  >
                    {ask.kind === 'sort' ? <><CircleCheck className="h-4 w-4" />Mark sorted</> : <><Undo2 className="h-4 w-4" />Back to review</>}
                  </button>
                  <button
                    type="button"
                    onClick={() => answerAsk(false)}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-control border border-border bg-surface-raised text-body font-semibold text-text-primary hover:bg-surface-overlay"
                  >
                    {ask.kind === 'sort' ? 'Not yet' : 'Keep sorted'}
                  </button>
                </div>
              </div>
            ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleResult(true)}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-control bg-good-soft text-body font-semibold text-good transition-opacity hover:opacity-80"
              >
                <Check className="h-4 w-4" />
                Got it
              </button>
              <button
                type="button"
                onClick={() => handleResult(false)}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-control bg-confused-soft text-body font-semibold text-confused transition-opacity hover:opacity-80"
              >
                <X className="h-4 w-4" />
                Didn't get it
              </button>
            </div>
            )}
          </>
        )}
      </div>

      {!isExam && !ask && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-meta text-text-muted">
            <span>Confidence</span>
            <span className="font-semibold tabular-nums">{confidencePercent}%</span>
          </div>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  i < Math.round(confidencePercent / 10)
                    ? confidencePercent >= 70 ? 'bg-good' : confidencePercent >= 40 ? 'bg-attn' : 'bg-confused'
                    : 'bg-surface-overlay',
                )}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Hard questions in the "confused" tone, easy ones in "good": calm, never a failure red. */
const DIFFICULTY_BADGE: Record<string, BadgeProps['variant']> = {
  hard: 'warning',
  medium: 'neutral',
  easy: 'success',
}
