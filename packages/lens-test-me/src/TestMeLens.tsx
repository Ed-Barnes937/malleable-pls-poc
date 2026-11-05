import { useState, useMemo, useEffect, useCallback } from 'react'
import { QUESTIONS, SORTED_TAG, type Question } from '@pls/substrate'
import { type LensProps, type ReviewMoment, useMarkSorted, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { Badge, type BadgeProps, cn, EmptyState, HiddenElsewhere, formatTime, TAG_STYLES } from '@pls/shared-ui'
import { ArrowUpRight, Check, CircleCheck, X, Eye, Timer } from 'lucide-react'

/** A card: a written question, or (a moment to review with none) "look at it again". */
type Card = Question & { conf: number; lookAgain?: ReviewMoment }

/** A focused review of the moments to review, started from the "N moments to review" chip. */
interface FocusedRun {
  moments: ReviewMoment[]
  index: number
  sorted: number
}

export default function TestMeLens({ scope, config, onNotify, onShowMoment, reviewRun, onReviewStarted }: LensProps) {
  const substrate = useSubstrate()
  const mutations = useSubstrateMutations()
  const markSorted = useMarkSorted(onNotify)

  const mode = (config.mode as string) ?? 'review'
  const timerSeconds = (config.timerSeconds as number) ?? 120
  const isExam = mode === 'exam'

  const { data: tags } = substrate.useTags(scope)
  const { data: confidence } = substrate.useConfidence(scope)
  const recordConfidence = mutations.useRecordConfidence()

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(timerSeconds)
  const [run, setRun] = useState<FocusedRun | null>(null)
  /** "Got it" on a confusing moment: asking whether to mark it sorted. */
  const [asking, setAsking] = useState(false)

  // A focused review asked for: start it here, once.
  useEffect(() => {
    if (!reviewRun) return
    setRun({ moments: reviewRun.moments, index: 0, sorted: 0 })
    setAnswer('')
    setRevealed(false)
    setAsking(false)
    onReviewStarted?.(reviewRun.id)
  }, [reviewRun, onReviewStarted])

  const sortedSegmentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const tag of tags ?? []) {
      if (tag.label === SORTED_TAG && tag.target_type === 'transcript_segment') ids.add(tag.target_id)
    }
    return ids
  }, [tags])

  // Confusing and not sorted since: these come first.
  const confusedSegmentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const tag of tags ?? []) {
      if (tag.label === 'confused' && tag.target_type === 'transcript_segment' && !sortedSegmentIds.has(tag.target_id)) {
        ids.add(tag.target_id)
      }
    }
    return ids
  }, [tags, sortedSegmentIds])

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

  // A focused run's cards, in the order the chip listed the moments.
  const runCards = useMemo((): Card[] => (run?.moments ?? []).map((moment) => {
    const conf = confidenceBySegment.get(moment.segmentId) ?? 50
    const q = QUESTIONS.find((x) => x.segmentId === moment.segmentId)
    if (q) return { ...q, conf }
    return {
      id: `look-${moment.segmentId}`,
      conceptLabel: moment.label,
      segmentId: moment.segmentId,
      course: '',
      question: `Look again: ${moment.label}`,
      answer: '',
      difficulty: 'medium',
      conf,
      lookAgain: moment,
    }
  }), [run?.moments, confidenceBySegment])

  // The course can change under us; never index past the filtered list.
  const currentQuestion: Card | undefined = run
    ? runCards[run.index]
    : sortedQuestions[sortedQuestions.length > 0 ? currentIndex % sortedQuestions.length : 0]
  const currentConfused = !!currentQuestion && confusedSegmentIds.has(currentQuestion.segmentId)
  const currentSorted = !!currentQuestion && sortedSegmentIds.has(currentQuestion.segmentId)

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

  const next = useCallback(() => {
    setAsking(false)
    setAnswer('')
    setRevealed(false)
    if (run) setRun((r) => r && { ...r, index: r.index + 1 })
    else setCurrentIndex((i) => (i + 1) % sortedQuestions.length)
  }, [run, sortedQuestions.length])

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

    // Got it on a moment still marked confusing: ask before moving on.
    if (gotIt && currentConfused) return setAsking(true)
    // Didn't get it on a sorted one: it is one to review again.
    if (!gotIt && currentSorted) {
      void markSorted.unsort(currentQuestion.segmentId)
      onNotify?.({ message: 'Back on your moments to review', key: `sorted-${currentQuestion.segmentId}` })
    }
    next()
  }, [currentQuestion, recordConfidence, currentConfused, currentSorted, markSorted, onNotify, next])

  const answerAsk = (sort: boolean) => {
    if (sort && currentQuestion) {
      void markSorted.sort(currentQuestion.segmentId)
      setRun((r) => r && { ...r, sorted: r.sorted + 1 })
    }
    next()
  }

  if (run && run.index >= run.moments.length) {
    const n = run.moments.length
    return (
      <div data-testid="review-run-done" className="flex h-full min-h-0 flex-col items-center justify-center gap-3 text-center">
        <CircleCheck className="h-8 w-8 text-good" />
        <p className="text-title font-semibold text-text-primary">Review done</p>
        <p className="text-body text-text-secondary">
          You went through {n} moment{n !== 1 ? 's' : ''}{run.sorted > 0 ? ` and sorted ${run.sorted}` : ''}.
        </p>
        <button
          type="button"
          onClick={() => setRun(null)}
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
    <div className="flex h-full min-h-0 flex-col gap-4">
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
        {run ? (
          <>
            <span data-testid="review-run-header" className="rounded-full bg-attn-soft px-2.5 py-0.5 text-meta font-semibold text-attn">
              Moments to review · {run.index + 1} of {run.moments.length}
            </span>
            <button type="button" onClick={() => setRun(null)} className="text-meta font-semibold text-accent hover:underline">
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

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 overflow-y-auto">
        <div className="flex flex-col items-start gap-2 rounded-item bg-surface-inset p-4">
          <p className="text-title font-medium text-text-primary">{currentQuestion.question}</p>
          <span className="flex flex-wrap items-center gap-1.5">
            {!currentQuestion.lookAgain && (
              <Badge variant={DIFFICULTY_BADGE[currentQuestion.difficulty] ?? 'neutral'} className="capitalize">
                {currentQuestion.difficulty}
              </Badge>
            )}
            {/* The moment's state, so the student knows what answering can do. */}
            {currentConfused && (
              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-meta font-semibold', TAG_STYLES.confused.bg, TAG_STYLES.confused.text)}>
                You marked this confusing
              </span>
            )}
            {currentSorted && (
              <span data-testid="test-me-sorted" className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-meta font-semibold', TAG_STYLES.sorted.bg, TAG_STYLES.sorted.text)}>
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

        {!revealed && !currentQuestion.lookAgain ? (
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
            {!currentQuestion.lookAgain && (
              <div className="flex flex-col gap-1 rounded-item bg-good-soft p-3">
                <p className="text-meta font-semibold text-good">Answer</p>
                <p className="text-body text-text-primary">{currentQuestion.answer}</p>
              </div>
            )}
            {asking ? (
              <div data-testid="ask-sorted" className={cn('flex flex-col gap-2 rounded-item border p-3', TAG_STYLES.sorted.bg)}>
                <p className="text-body font-semibold text-text-primary">Mark sorted?</p>
                <p className="text-meta text-text-secondary">
                  It leaves your moments to review and gets no more reviews. It stays marked as once confusing.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => answerAsk(true)}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-control bg-good text-body font-semibold text-accent-foreground hover:opacity-90"
                  >
                    <CircleCheck className="h-4 w-4" />
                    Mark sorted
                  </button>
                  <button
                    type="button"
                    onClick={() => answerAsk(false)}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-control border border-border bg-surface-raised text-body font-semibold text-text-primary hover:bg-surface-overlay"
                  >
                    Not yet
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

      {!isExam && !asking && (
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
