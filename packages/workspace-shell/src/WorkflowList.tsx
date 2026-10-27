import type { ReactNode } from 'react'
import { ZapOff, AlertTriangle } from 'lucide-react'
import { Spinner, cn } from '@pls/shared-ui'
import { type WorkflowWithJobs } from '@pls/substrate'
import { WorkflowCard } from './WorkflowCard'

interface WorkflowListProps {
  workflows: WorkflowWithJobs[] | undefined
  isLoading: boolean
  isError: boolean
  error: { message?: string } | null
  workspaceId: string
  showEditDelete?: boolean
  onEdit?: (workflow: WorkflowWithJobs) => void
  errorLabel: string
  emptyLabel: string
  /** Rendered after the list (e.g. a "New automation" button). */
  footer?: ReactNode
  className?: string
}

/** Shared load/error/empty scaffold around a list of `WorkflowCard`s. */
export function WorkflowList({
  workflows,
  isLoading,
  isError,
  error,
  workspaceId,
  showEditDelete,
  onEdit,
  errorLabel,
  emptyLabel,
  footer,
  className,
}: WorkflowListProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Spinner size="sm" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-1.5 rounded-item border border-confused-line bg-confused-soft py-6 text-center">
          <AlertTriangle className="h-5 w-5 text-confused" />
          <p className="text-body text-confused">{errorLabel}</p>
          <p className="px-3 text-meta text-text-secondary">{error?.message ?? 'Request failed'}</p>
        </div>
      ) : workflows && workflows.length > 0 ? (
        workflows.map((wf) => (
          <WorkflowCard
            key={wf.id}
            workflow={wf}
            workspaceId={workspaceId}
            showEditDelete={showEditDelete}
            onEdit={onEdit}
          />
        ))
      ) : (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <ZapOff className="h-5 w-5 text-text-muted" />
          <p className="text-body text-text-muted">{emptyLabel}</p>
        </div>
      )}
      {footer}
    </div>
  )
}
