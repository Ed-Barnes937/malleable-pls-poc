import { cn } from './utils'

export interface ProgressBarProps {
  value: number
  color?: string
  rounded?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function ProgressBar({
  value,
  color = 'bg-accent',
  rounded = false,
  size = 'md',
  className,
}: ProgressBarProps) {
  const height = size === 'sm' ? 'h-2.5' : 'h-4'
  const radius = rounded ? 'rounded-full' : 'rounded'

  return (
    <div className={cn(height, radius, 'bg-neutral-800', className)}>
      <div
        className={cn('h-full transition-all duration-500', radius, color)}
        style={{ width: `${value}%`, opacity: 0.7 }}
      />
    </div>
  )
}
