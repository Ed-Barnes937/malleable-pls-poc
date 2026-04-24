import type { ComponentType, ReactNode } from 'react'

export interface EmptyStateProps {
  message: string
  icon?: ComponentType<{ className?: string }>
  action?: ReactNode
}

export function EmptyState({ message, icon: Icon, action }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-neutral-600">
      {Icon && <Icon className="h-6 w-6 text-neutral-600" />}
      <span>{message}</span>
      {action && <div>{action}</div>}
    </div>
  )
}
