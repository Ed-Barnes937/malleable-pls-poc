import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTags, useConfidence, useRecordConfidence, QUESTIONS, type Question } from '@pls/substrate'
import { type LensProps } from '@pls/workspace-shell'
import { cn } from '@pls/shared-ui'
import { Check, X, Eye, ChevronRight, Timer } from 'lucide-react'

export default function TestMeLens({ scope, config }: LensProps) {
  const mode = (config.mode as string) ?? 'review'
  const timerSeconds = (config.timerSeconds as number) ?? 120
  const isExam = mode === 'exam'

  const { data: tags } = useTags(scope)
  const { data: confidence } = useConfidence(scope)
  const recordConfidence = useRecordConfidence()

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

  const sortedQuestions = useMemo(() => {
    const scored = QUESTIONS.map((q) => {
      const isConfused = confusedSegmentIds.has(q.segmentId)
      const conf = confidenceBySegment.get(q.segmentId) ?? 50
      const priority = (isConfused ? 0 : 1000) + conf
      return { ...q, priority, conf }
    })
    scored.sort((a, b) => a.priority - b.priority)
    return scored
  }, [confusedSegmentIds, confidenceBySegment])

  const currentQuestion: (Question & { conf: number }) | undefined = sortedQuestions[currentIndex]

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
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-600">
        No questions available
      </div>
    )
  }

  const confidencePercent = currentQuestion.conf ?? 50
  const timerPercent = isExam ? (timeLeft / timerSeconds) * 100 : 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {isExam && (
        <div className="flex items-center gap-2">
          <Timer className={cn('h-3.5 w-3.5', timeLeft < 30 ? 'text-tag-confused' : 'text-neutral-500')} />
          <div className="flex-1">
            <div className="h-1.5 rounded-full bg-neutral-800">
              <div
                className={cn('h-full rounded-full transition-all duration-1000', timeLeft < 30 ? 'bg-tag-confused' : 'bg-accent/50')}
                style={{ width: `${timerPercent}%` }}
              />
            </div>
          </div>
          <span className={cn('font-mono text-xs tabular-nums', timeLeft < 30 ? 'text-tag-confused' : 'text-neutral-500')}>
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-600">
          {isExam ? 'Exam Mode' : 'Review'}
        </span>
        <span className="font-mono text-[10px] text-neutral-600">
          {currentIndex + 1}/{sortedQuestions.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 flex flex-col justify-center gap-4 overflow-y-auto">
        <div className="rounded-lg border border-border-subtle bg-surface-overlay/50 p-4">
          <p className="text-sm leading-relaxed text-neutral-200">{currentQuestion.question}</p>
          <div className="mt-2 flex items-center gap-1.5">
            <span className={cn(
              'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
              currentQuestion.difficulty === 'hard' ? 'bg-tag-confused/15 text-tag-confused'
                : currentQuestion.difficulty === 'easy' ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-neutral-700/50 text-neutral-500'
            )}>
              {currentQuestion.difficulty}
            </span>
          </div>
        </div>

        {!revealed ? (
          <>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer..."
              className="resize-none rounded-lg border border-border-subtle bg-surface p-3 text-sm text-neutral-300 placeholder:text-neutral-700 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
              rows={2}
            />
            <button
              onClick={() => setRevealed(true)}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-overlay px-4 py-2 text-sm font-medium text-neutral-300 transition-all hover:border-accent/40 hover:text-neutral-100"
            >
              <Eye className="h-3.5 w-3.5" />
              Reveal Answer
            </button>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-500/70 mb-1">Answer</p>
              <p className="text-sm leading-relaxed text-neutral-300">{currentQuestion.answer}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleResult(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500/10 py-2.5 text-sm font-medium text-emerald-400 ring-1 ring-emerald-500/20 transition-all hover:bg-emerald-500/20"
              >
                <Check className="h-4 w-4" />
                Got it
              </button>
              <button
                onClick={() => handleResult(false)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-tag-confused/10 py-2.5 text-sm font-medium text-tag-confused ring-1 ring-tag-confused/20 transition-all hover:bg-tag-confused/20"
              >
                <X className="h-4 w-4" />
                Didn't get it
              </button>
            </div>
          </>
        )}
      </div>

      {!isExam && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-neutral-600">Confidence</span>
            <span className="font-mono text-neutral-500">{confidencePercent}%</span>
          </div>
          <div className="flex gap-0.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-2 flex-1 rounded-sm transition-colors',
                  i < Math.round(confidencePercent / 10)
                    ? confidencePercent >= 70 ? 'bg-emerald-500/70' : confidencePercent >= 40 ? 'bg-tag-key-point/50' : 'bg-tag-confused/50'
                    : 'bg-neutral-800'
                )}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
