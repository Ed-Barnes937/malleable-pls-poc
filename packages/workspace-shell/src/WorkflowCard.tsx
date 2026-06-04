import { Pencil, Trash2, ChevronRight } from 'lucide-react'
import { cn, Switch } from '@pls/shared-ui'
import {
  useToggleWorkflow,
  useCreateWorkspaceOverride,
  useDeleteWorkflow,
} from '@pls/substrate-client'
import {
  getAvailableJobTypes,
  getAvailableTriggerEvents,
  type WorkflowWithJobs,
} from '@pls/substrate'

const JOB_TYPE_INFO = Object.fromEntries(getAvailableJobTypes().map((j) => [j.type, j]))
const TRIGGER_LABELS = Object.fromEntries(
  getAvailableTriggerEvents().map((t) => [t.event, t.label]),
)

const DAY_MS = 86400000

interface WorkflowCardProps {
  // Server rows carry workspace_id (null = default workflow); the core
  // WorkflowWithJobs type deliberately omits it.
  workflow: WorkflowWithJobs & { workspace_id?: string | null }
  workspaceId: string
  /** When true, renders edit/delete buttons for non-default workflows. */
  showEditDelete?: boolean
  onEdit?: (workflow: WorkflowWithJobs) => void
}

export function WorkflowCard({ workflow, workspaceId, showEditDelete = false, onEdit }: WorkflowCardProps) {
  const toggleWorkflow = useToggleWorkflow()
  const createOverride = useCreateWorkspaceOverride()
  const deleteWorkflow = useDeleteWorkflow()
  const isEnabled = !!workflow.enabled
  const isDefault = workflow.workspace_id === null

  const handleToggle = () => {
    if (isDefault) {
      createOverride.mutate({ sourceWorkflowId: workflow.id, workspaceId, enabled: !isEnabled })
    } else {
      toggleWorkflow.mutate({ workflowId: workflow.id, enabled: !isEnabled })
    }
  }

  const triggerLabel = TRIGGER_LABELS[workflow.trigger_event] ?? workflow.trigger_event
  const conditionLabel =
    workflow.condition_field && workflow.condition_value
      ? `${workflow.condition_field} = "${workflow.condition_value}"`
      : null

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-all',
        isEnabled ? 'border-accent/20 bg-accent/5' : 'border-border-subtle bg-surface opacity-60',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-neutral-300">{triggerLabel}</p>
          {conditionLabel && (
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-neutral-600">
              <ChevronRight className="h-2.5 w-2.5" />
              where {conditionLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {showEditDelete && !isDefault && (
            <>
              <button
                onClick={() => onEdit?.(workflow)}
                aria-label="Edit workflow"
                className="rounded p-1 text-neutral-600 transition-colors hover:bg-surface-overlay hover:text-neutral-300"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => deleteWorkflow.mutate({ workflowId: workflow.id })}
                aria-label="Delete workflow"
                className="rounded p-1 text-neutral-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
          <Switch checked={isEnabled} onCheckedChange={handleToggle} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {workflow.jobs.map((job) => {
          const info = JOB_TYPE_INFO[job.job_type]
          return (
            <div
              key={job.id}
              className="flex items-center gap-2 rounded-md bg-surface-overlay/50 px-2.5 py-1.5"
            >
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                  info?.category === 'AI'
                    ? 'bg-purple-500/20 text-purple-400'
                    : info?.category === 'Search'
                      ? 'bg-blue-500/20 text-blue-400'
                      : info?.category === 'Schedule'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-emerald-500/20 text-emerald-400',
                )}
              >
                {info?.category ?? 'Job'}
              </span>
              <span className="text-xs text-neutral-300">{info?.label ?? job.job_type}</span>
              {job.delay_ms > 0 && (
                <span className="ml-auto text-[10px] text-neutral-600">
                  +{Math.round(job.delay_ms / DAY_MS)}d
                </span>
              )}
            </div>
          )
        })}
      </div>

      {isDefault && (
        <p className="mt-2 text-[10px] text-neutral-700">
          Default — toggling creates a workspace-specific override
        </p>
      )}
    </div>
  )
}
