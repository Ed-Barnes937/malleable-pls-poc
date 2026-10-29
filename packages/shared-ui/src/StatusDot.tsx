import { cn } from './utils'

export type StatusDotStatus = 'running' | 'complete' | 'failed' | 'idle'

export interface StatusDotProps {
  status: StatusDotStatus
  pulse?: boolean
  className?: string
}

const COLORS: Record<StatusDotStatus, string> = {
  running: 'bg-accent',
  complete: 'bg-good',
  failed: 'bg-confused',
  idle: 'bg-text-muted',
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
