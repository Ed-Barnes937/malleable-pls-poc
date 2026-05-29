import { createPortal } from 'react-dom'
import { useRunningJobCount, useRecentJobs } from '@pls/substrate-client'
import { getAvailableJobTypes } from '@pls/substrate'
import { Zap, X } from 'lucide-react'
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

interface JobRow {
  id: string
  job_type: string
  status: string
  started_at?: string | null
  completed_at?: string | null
  created_at?: string | null
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
    <div className="flex items-center gap-2 border-b border-border-subtle/50 px-3 py-2 last:border-0">
      <StatusDot status={statusDotStatus(job.status)} />
      <span className="flex-1 truncate text-[11px] text-neutral-300">{jobLabel(job.job_type)}</span>
      {elapsed !== null ? (
        <span className={cn('text-[10px] tabular-nums', isRunning ? 'text-accent' : 'text-neutral-600')}>
          {elapsed}
        </span>
      ) : (
        <span className="text-[10px] text-neutral-600">{job.status}</span>
      )}
    </div>
  )
}

function ActivityDrawer({ onClose }: { onClose: () => void }) {
  const { data: jobs } = useRecentJobs(20)
  const [now, setNow] = useState(() => Date.now())

  const rows = (jobs ?? []) as unknown as JobRow[]
  const running = rows.filter((j) => j.status === 'running' || j.status === 'pending')
  const finished = rows.filter((j) => j.status === 'completed' || j.status === 'failed')

  // Tick once a second while jobs are running so elapsed time stays live.
  useEffect(() => {
    if (running.length === 0) return
    const handle = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(handle)
  }, [running.length])

  return createPortal(
    <>
      <div className="fixed inset-0 z-[150] bg-black/30" onClick={onClose} />
      <aside
        className="fixed bottom-0 right-0 top-0 z-[151] flex w-80 flex-col border-l border-border-subtle bg-surface-raised shadow-2xl"
        aria-label="Job activity"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-neutral-200">Activity</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-surface-overlay hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-3 py-8 text-center text-[11px] text-neutral-600">No jobs yet</div>
          ) : (
            <>
              {running.length > 0 && (
                <div>
                  <div className="px-3 pt-3 pb-1">
                    <SectionLabel>In progress</SectionLabel>
                  </div>
                  {running.map((job) => (
                    <JobItem key={job.id} job={job} now={now} />
                  ))}
                </div>
              )}
              {finished.length > 0 && (
                <div>
                  <div className="px-3 pt-3 pb-1">
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

  return (
    <>
      <button
        onClick={toggle}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] transition-colors',
          isActive
            ? 'text-accent hover:bg-accent/10'
            : 'text-neutral-600 hover:bg-surface-overlay hover:text-neutral-400',
        )}
        title={isActive ? `${count} jobs running` : 'Job activity'}
      >
        <Zap className={cn('h-3 w-3', isActive && 'animate-pulse')} />
        {isActive && <span>{count} running</span>}
      </button>
      {showDrawer && <ActivityDrawer onClose={() => setShowDrawer(false)} />}
    </>
  )
}
