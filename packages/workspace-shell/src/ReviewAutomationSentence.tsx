import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@pls/shared-ui'
import { usePatchWorkflow } from '@pls/substrate-client'
import {
  parseReviewParams,
  REVIEW_DURATION_OPTIONS,
  REVIEW_TASK_JOB,
  REVIEW_TRIGGER_LABELS,
  REVIEW_WINDOW_OPTIONS,
  reviewWindowLabel,
  type ReviewTaskParams,
  type WorkflowJob,
  type WorkflowWithJobs,
} from '@pls/substrate'

export { reviewJobOf } from '@pls/substrate'

function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

/** What saving did to the reviews it already made, in the words of what happened. */
export function savedMessage(reviews: { moved: number; resized: number; unscheduled: number }, durationMin: number): string {
  const { moved, resized, unscheduled } = reviews
  if (unscheduled > 0) {
    return `Saved. ${unscheduled === 1 ? '1 review no longer fits' : `${unscheduled} reviews no longer fit`} - it's on your to-do list.`
  }
  if (moved > 0) return `Saved. Moved ${moved === 1 ? '1 review' : `${moved} reviews`} to fit.`
  if (resized > 0) return `Saved. ${resized === 1 ? 'Your review is' : `${resized} reviews are`} now ${durationMin} min.`
  return 'Saved. New reviews will follow this.'
}

/**
 * The confusion automation as an editable sentence:
 * "When I mark something [confusing], add a [20]-min review [within 3 days]."
 * Each bold word is a dropdown; a change saves at once and the server moves
 * any open reviews it made that have not started yet.
 */
export function ReviewAutomationSentence({ workflow, job }: { workflow: WorkflowWithJobs; job: WorkflowJob }) {
  const patch = usePatchWorkflow()
  const stored = parseReviewParams(job.params)
  const [label, setLabel] = useState(workflow.condition_value ?? 'confused')
  const [params, setParams] = useState<ReviewTaskParams>(stored)
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // Follow saved values from elsewhere (another tab, the generic editor), but
  // never overwrite a choice that is still saving.
  const storedKey = `${workflow.condition_value}:${stored.durationMin}:${stored.windowDays}:${stored.timeZone}`
  useEffect(() => {
    if (patch.isPending) return
    setLabel(workflow.condition_value ?? 'confused')
    setParams(parseReviewParams(job.params))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey])

  const save = (next: { label?: string; params?: ReviewTaskParams }) => {
    const nextParams = next.params ? { ...next.params, timeZone: browserTimeZone() ?? next.params.timeZone } : undefined
    if (next.label) setLabel(next.label)
    if (nextParams) setParams(nextParams)
    setStatus(null)
    patch.mutate(
      {
        workflowId: workflow.id,
        ...(next.label ? { conditionValue: next.label } : {}),
        ...(nextParams ? { jobParams: [{ workflowJobId: job.id, params: { ...nextParams } }] } : {}),
      },
      {
        onSuccess: ({ reviews }) => setStatus({ tone: 'ok', text: savedMessage(reviews, (nextParams ?? params).durationMin) }),
        onError: () => {
          setLabel(workflow.condition_value ?? 'confused')
          setParams(stored)
          setStatus({ tone: 'error', text: "Couldn't save that change. Try again." })
        },
      },
    )
  }

  const labels = { ...REVIEW_TRIGGER_LABELS, ...(label in REVIEW_TRIGGER_LABELS ? {} : { [label]: `as "${label}"` }) }

  return (
    <div data-testid="review-automation-sentence">
      <p className="text-title leading-7 text-text-primary">
        When I mark something{' '}
        <InlineChoice
          label="Which mark starts this"
          value={label}
          onChange={(value) => save({ label: value })}
          options={Object.entries(labels).map(([value, text]) => ({ value, text }))}
        />
        , add a{' '}
        <span className="whitespace-nowrap">
          <InlineChoice
            label="Review length in minutes"
            value={String(params.durationMin)}
            onChange={(value) => save({ params: { ...params, durationMin: Number(value) } })}
            options={withCurrent(REVIEW_DURATION_OPTIONS, params.durationMin).map((m) => ({ value: String(m), text: String(m) }))}
          />
          -min review
        </span>{' '}
        <InlineChoice
          label="When the review should happen by"
          value={String(params.windowDays)}
          onChange={(value) => save({ params: { ...params, windowDays: Number(value) } })}
          options={withCurrent(REVIEW_WINDOW_OPTIONS, params.windowDays).map((d) => ({ value: String(d), text: reviewWindowLabel(d) }))}
        />
        .
      </p>
      <Hint status={status} pending={patch.isPending}>
        It goes in free time around your classes and shifts, linked to the moment you marked.
      </Hint>
    </div>
  )
}

function withCurrent(options: readonly number[], current: number): number[] {
  return options.includes(current) ? [...options] : [...options, current].sort((a, b) => a - b)
}

/**
 * A word in the sentence the student can change. The visible pill sizes to
 * the chosen word; a transparent native select on top does the choosing, so
 * keyboard, screen reader and mobile pickers all work.
 */
function InlineChoice({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; text: string }[]
  onChange: (value: string) => void
}) {
  const current = options.find((o) => o.value === value)?.text ?? value
  return (
    <span
      className={cn(
        'relative inline-flex items-center gap-0.5 rounded-item bg-accent-soft px-1.5 align-baseline font-semibold text-accent',
        'transition-colors hover:bg-accent/25 focus-within:ring-2 focus-within:ring-accent/60',
      )}
    >
      <span aria-hidden className="underline decoration-accent/40 decoration-dotted underline-offset-4">{current}</span>
      <ChevronDown aria-hidden className="h-3 w-3 opacity-70" />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </select>
    </span>
  )
}

function Hint({
  status,
  pending,
  children,
}: {
  status: { tone: 'ok' | 'error'; text: string } | null
  pending: boolean
  children: ReactNode
}) {
  return (
    <p
      aria-live="polite"
      className={cn(
        'mt-1 text-meta',
        status?.tone === 'error' ? 'text-confused' : status ? 'text-good' : 'text-text-muted',
      )}
    >
      {pending ? 'Saving...' : status ? status.text : children}
    </p>
  )
}
