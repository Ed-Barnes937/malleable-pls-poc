import type { ButtonHTMLAttributes, ComponentType } from 'react'
import { cn } from './utils'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ComponentType<{ className?: string }>
  size?: 'sm' | 'md'
  label: string
}

const SIZES = {
  sm: { button: 'h-7 w-7', icon: 'h-3.5 w-3.5' },
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
        'inline-flex items-center justify-center rounded-md text-neutral-400 transition-colors',
        'hover:bg-neutral-800 hover:text-neutral-100',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-neutral-400',
        s.button,
        className,
      )}
      {...rest}
    >
      <Icon className={s.icon} />
    </button>
  )
}
