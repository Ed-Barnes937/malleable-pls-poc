import { useState, useMemo, useEffect, useCallback } from 'react'
import { QUESTIONS, type Question } from '@pls/substrate'
import { type LensProps, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { Badge, type BadgeProps, cn, EmptyState, HiddenElsewhere, formatTime } from '@pls/shared-ui'
import { Check, X, Eye, ChevronRight, Timer } from 'lucide-react'

export default function TestMeLens({ scope, config }: LensProps) {
  const substrate = useSubstrate()
  const mutations = useSubstrateMutations()

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

  const confusedSegmentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const tag of tags ?? []) {
      if (tag.label === 'confused' && tag.target_type === 'transcript_segment') {
        ids.add(tag.target_id)
      }
    }
    return ids
  }, [tags])

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

  // The course can change under us; never index past the filtered list.
  const currentQuestion: (Question & { conf: number }) | undefined =
    sortedQuestions[sortedQuestions.length > 0 ? currentIndex % sortedQuestions.length : 0]

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

    setAnswer('')
    setRevealed(false)
    setCurrentIndex((i) => (i + 1) % sortedQuestions.length)
  }, [currentQuestion, recordConfidence, sortedQuestions.length])

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
        <span className="text-meta font-semibold text-text-muted">
          {isExam ? 'Exam mode' : 'Review'}
        </span>
        <span className="flex items-center gap-2">
          {hidden}
          <span className="text-meta tabular-nums text-text-muted">
            {(currentIndex % sortedQuestions.length) + 1}/{sortedQuestions.length}
          </span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 overflow-y-auto">
        <div className="flex flex-col items-start gap-2 rounded-item bg-surface-inset p-4">
          <p className="text-title font-medium text-text-primary">{currentQuestion.question}</p>
          <Badge variant={DIFFICULTY_BADGE[currentQuestion.difficulty] ?? 'neutral'} className="capitalize">
            {currentQuestion.difficulty}
          </Badge>
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
          </>
        )}
      </div>

      {!isExam && (
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
