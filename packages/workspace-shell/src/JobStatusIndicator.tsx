import { createPortal } from 'react-dom'
import { useRunningJobCount, useRecentJobs, useRetryJob } from '@pls/substrate-client'
import { getAvailableJobTypes } from '@pls/substrate'
import { Zap, X, RotateCcw } from 'lucide-react'
import { cn, StatusDot, SectionLabel } from '@pls/shared-ui'
import { useState, useCallback, useEffect } from 'react'

const JOB_LABELS: Record<string, string> = Object.fromEntries(
  getAvailableJobTypes().map((j) => [j.type, j.label]),
)

function jobLabel(jobType: string): string {
  return JOB_LABELS[jobType] ?? jobType
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

function toMs(value: unknown): number | null {
  if (!value) return null
  const ms = new Date(value as string).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** Student-facing words for a run's status when there's no time to show. */
const STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting',
  running: 'Working',
  completed: 'Done',
  failed: 'Didn\'t finish',
}

interface JobRow {
  id: string
  job_type: string
  status: string
  started_at?: string | null
  completed_at?: string | null
  created_at?: string | null
  error?: string | null
  /** Failed with automatic retries exhausted - the student can retry by hand. */
  retryable?: boolean
}

function statusDotStatus(status: string) {
  return status === 'completed'
    ? 'complete'
    : status === 'running'
      ? 'running'
      : status === 'failed'
        ? 'failed'
        : 'idle'
}

function JobItem({ job, now }: { job: JobRow; now: number }) {
  const isRunning = job.status === 'running'
  const startMs = toMs(job.started_at)
  const elapsed =
    isRunning && startMs !== null
      ? formatElapsed(now - startMs)
      : job.status === 'completed' && startMs !== null && toMs(job.completed_at) !== null
        ? formatElapsed((toMs(job.completed_at) as number) - startMs)
        : null

  return (
    <div
      data-testid="job-item"
      className="border-b border-border-subtle px-5 py-2.5 last:border-0"
    >
      <div className="flex items-center gap-2">
        <StatusDot status={statusDotStatus(job.status)} />
        <span className="flex-1 truncate text-body text-text-primary">{jobLabel(job.job_type)}</span>
        {elapsed !== null ? (
          <span className={cn('text-meta tabular-nums', isRunning ? 'text-accent' : 'text-text-muted')}>
            {elapsed}
          </span>
        ) : (
          <span className="text-meta text-text-muted">{STATUS_LABELS[job.status] ?? job.status}</span>
        )}
      </div>
      {job.status === 'failed' && <FailedJobDetails job={job} />}
    </div>
  )
}

/**
 * Plain-language outcome for a failed run, with the raw error tucked behind
 * "Details" (it is written for developers) and a retry once automatic
 * retries are used up.
 */
function FailedJobDetails({ job }: { job: JobRow }) {
  const retry = useRetryJob()

  return (
    <div className="mt-1 pl-4">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-meta text-text-secondary">
          {job.retryable
            ? 'This didn\'t finish. Give it another go.'
            : 'This attempt didn\'t finish, so it was retried automatically.'}
        </p>
        {job.retryable && (
          <button
            type="button"
            onClick={() => retry.mutate(job.id)}
            disabled={retry.isPending}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-item border border-border bg-surface-raised px-2.5 text-meta font-medium text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
      </div>
      {job.error && (
        <details className="mt-1 text-meta text-text-muted">
          <summary className="cursor-pointer select-none hover:text-text-primary">Details</summary>
          <p className="mt-0.5 break-words font-mono">{job.error}</p>
        </details>
      )}
    </div>
  )
}

function ActivityDrawer({ onClose }: { onClose: () => void }) {
  const { data: jobs } = useRecentJobs(20)
  const [now, setNow] = useState(() => Date.now())

  const rows = jobs ?? []
  const running = rows.filter((j) => j.status === 'running' || j.status === 'pending')
  const finished = rows.filter((j) => j.status === 'completed' || j.status === 'failed')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Tick once a second while jobs are running so elapsed time stays live.
  useEffect(() => {
    if (running.length === 0) return
    const handle = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(handle)
  }, [running.length])

  return createPortal(
    <>
      {/* Above the top bar (z 9999), like the board menu. */}
      <div className="fixed inset-0 z-[10000] bg-black/25" onClick={onClose} />
      <aside
        className="fixed bottom-0 right-0 top-0 z-[10001] flex w-80 max-w-[calc(100vw-48px)] flex-col rounded-l-widget bg-surface-raised shadow-pop"
        aria-label="Activity"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-accent" />
            <h2 className="text-title font-semibold text-text-primary">Activity</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close activity"
            title="Close activity"
            className="flex h-8 w-8 items-center justify-center rounded-item text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-6 py-8 text-center text-body text-text-muted">
              Nothing here yet. When an automation runs, like transcribing a lecture, you can follow it here.
            </div>
          ) : (
            <>
              {running.length > 0 && (
                <div>
                  <div className="px-5 pt-3 pb-1">
                    <SectionLabel>In progress</SectionLabel>
                  </div>
                  {running.map((job) => (
                    <JobItem key={job.id} job={job} now={now} />
                  ))}
                </div>
              )}
              {finished.length > 0 && (
                <div>
                  <div className="px-5 pt-3 pb-1">
                    <SectionLabel>Recent</SectionLabel>
                  </div>
                  {finished.map((job) => (
                    <JobItem key={job.id} job={job} now={now} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>,
    document.body,
  )
}

export function JobStatusIndicator() {
  const { data: count } = useRunningJobCount()
  const [showDrawer, setShowDrawer] = useState(false)
  const isActive = (count ?? 0) > 0

  const toggle = useCallback(() => setShowDrawer((v) => !v), [])
  const label = isActive ? `Activity: ${count} running` : 'Activity'

  return (
    <>
      <button
        type="button"
        data-testid="activity-button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={showDrawer}
        className={cn(
          'flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-control px-2 text-meta transition-colors',
          isActive
            ? 'text-accent hover:bg-accent-soft'
            : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary',
        )}
        title={label}
      >
        <Zap className={cn('h-[18px] w-[18px]', isActive && 'animate-pulse')} />
        {isActive && <span>{count} running</span>}
      </button>
      {showDrawer && <ActivityDrawer onClose={() => setShowDrawer(false)} />}
    </>
  )
}
