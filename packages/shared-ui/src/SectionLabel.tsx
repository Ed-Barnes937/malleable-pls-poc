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
        'text-meta font-semibold text-text-muted',
        className,
      )}
    >
      {children}
    </div>
  )
}
