import type { ComponentType, ReactNode } from 'react'

export interface EmptyStateProps {
  message: string
  icon?: ComponentType<{ className?: string }>
  action?: ReactNode
}

export function EmptyState({ message, icon: Icon, action }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-body text-text-muted">
      {Icon && <Icon className="h-6 w-6 text-text-muted" />}
      <span>{message}</span>
      {action && <div>{action}</div>}
    </div>
  )
}
