import type { ButtonHTMLAttributes, ComponentType } from 'react'
import { cn } from './utils'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ComponentType<{ className?: string }>
  size?: 'sm' | 'md'
  label: string
}

const SIZES = {
  sm: { button: 'h-8 w-8', icon: 'h-4 w-4' },
  md: { button: 'h-9 w-9', icon: 'h-4 w-4' },
} as const

export function IconButton({
  icon: Icon,
  size = 'sm',
  label,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const s = SIZES[size]
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center rounded-item text-text-muted transition-colors',
        'hover:bg-surface-overlay hover:text-text-primary',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-text-muted',
        s.button,
        className,
      )}
      {...rest}
    >
      <Icon className={s.icon} />
    </button>
  )
}
