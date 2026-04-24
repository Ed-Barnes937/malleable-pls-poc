import { cn } from './utils'
import type { ComponentType, ReactNode } from 'react'

const VARIANTS = {
  accent: 'bg-accent/10 text-accent',
  success: 'bg-emerald-500/15 text-emerald-400',
  warning: 'bg-tag-confused/15 text-tag-confused',
  neutral: 'bg-neutral-700/50 text-neutral-500',
} as const

const SIZES = {
  sm: { pill: 'px-1.5 py-0.5 text-[10px]', icon: 'h-2.5 w-2.5' },
  md: { pill: 'px-2 py-0.5 text-xs', icon: 'h-3 w-3' },
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
        'inline-flex items-center gap-1 rounded-full font-medium',
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
