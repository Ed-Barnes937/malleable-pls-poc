import type { ReactNode } from 'react'
import { cn } from './utils'

export interface SectionLabelProps {
  children: ReactNode
  className?: string
}

export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <div
      className={cn(
        'text-[10px] font-medium uppercase tracking-widest text-neutral-500',
        className,
      )}
    >
      {children}
    </div>
  )
}
