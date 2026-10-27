import { cn } from './utils'
import type { ComponentType, ReactNode } from 'react'

const VARIANTS = {
  accent: 'bg-accent-soft text-accent',
  success: 'bg-good-soft text-good',
  warning: 'bg-confused-soft text-confused',
  neutral: 'bg-surface-overlay text-text-secondary',
} as const

const SIZES = {
  sm: { pill: 'px-2 py-0.5 text-meta', icon: 'h-3 w-3' },
  md: { pill: 'px-2.5 py-0.5 text-body', icon: 'h-3.5 w-3.5' },
} as const

export interface BadgeProps {
  children: ReactNode
  variant?: keyof typeof VARIANTS
  ring?: boolean
  size?: keyof typeof SIZES
  icon?: ComponentType<{ className?: string }>
  className?: string
}

export function Badge({
  children,
  variant = 'neutral',
  ring = false,
  size = 'sm',
  icon: Icon,
  className,
}: BadgeProps) {
  const s = SIZES[size]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold',
        s.pill,
        VARIANTS[variant],
        ring && 'ring-1 ring-current/20',
        className,
      )}
    >
      {Icon && <Icon className={s.icon} />}
      {children}
    </span>
  )
}
