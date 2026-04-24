import { cn } from './utils'

export type StatusDotStatus = 'running' | 'complete' | 'failed' | 'idle'

export interface StatusDotProps {
  status: StatusDotStatus
  pulse?: boolean
  className?: string
}

const COLORS: Record<StatusDotStatus, string> = {
  running: 'bg-sky-400',
  complete: 'bg-emerald-400',
  failed: 'bg-rose-400',
  idle: 'bg-neutral-500',
}

export function StatusDot({ status, pulse, className }: StatusDotProps) {
  const shouldPulse = pulse ?? status === 'running'
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        COLORS[status],
        shouldPulse && 'animate-pulse',
        className,
      )}
    />
  )
}
