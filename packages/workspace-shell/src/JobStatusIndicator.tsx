import { createPortal } from 'react-dom'
import { useRunningJobCount, useRecentJobs } from '@pls/substrate'
import { Zap } from 'lucide-react'
import { cn, StatusDot, SectionLabel } from '@pls/shared-ui'
import { useState, useRef, useLayoutEffect, useCallback } from 'react'

function JobHistoryPopover({ anchorRef, onClose }: { anchorRef: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const { data: jobs } = useRecentJobs(10)
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)

  useLayoutEffect(() => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({ left: rect.left, bottom: window.innerHeight - rect.top + 8 })
  }, [anchorRef])

  if (!pos) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[90]" onClick={onClose} />
      <div
        className="fixed z-[91] w-72 rounded-lg border border-border-subtle bg-surface-raised shadow-xl"
        style={{ left: pos.left, bottom: pos.bottom }}
      >
        <div className="border-b border-border-subtle px-3 py-2">
          <SectionLabel>Recent jobs</SectionLabel>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {jobs && jobs.length > 0 ? (
            jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-2 border-b border-border-subtle/50 px-3 py-2 last:border-0"
              >
                <StatusDot status={job.status === 'completed' ? 'complete' : job.status === 'running' ? 'running' : job.status === 'failed' ? 'failed' : 'idle'} />
                <span className="flex-1 truncate text-[11px] text-neutral-400">
                  {job.job_type}
                </span>
                <span className="text-[10px] text-neutral-600">
                  {job.status}
                </span>
              </div>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-[11px] text-neutral-600">
              No jobs yet
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}

export function JobStatusIndicator() {
  const { data: count } = useRunningJobCount()
  const [showHistory, setShowHistory] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const isActive = (count ?? 0) > 0

  const toggle = useCallback(() => setShowHistory((v) => !v), [])

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] transition-colors',
          isActive
            ? 'text-accent hover:bg-accent/10'
            : 'text-neutral-600 hover:bg-surface-overlay hover:text-neutral-400'
        )}
        title={isActive ? `${count} jobs running` : 'Job history'}
      >
        <Zap className={cn('h-3 w-3', isActive && 'animate-pulse')} />
        {isActive && <span>{count} running</span>}
      </button>
      {showHistory && <JobHistoryPopover anchorRef={buttonRef} onClose={() => setShowHistory(false)} />}
    </>
  )
}
