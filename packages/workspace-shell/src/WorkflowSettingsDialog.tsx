import { createPortal } from 'react-dom'
import { X, Zap, ZapOff, ChevronRight } from 'lucide-react'
import { cn, Switch, Spinner } from '@pls/shared-ui'
import {
  useWorkflowsForLens,
  useToggleWorkflow,
  useCreateWorkspaceOverride,
  getAvailableJobTypes,
  type WorkflowWithJobs,
} from '@pls/substrate'
import { useWorkspaceStore } from './store'

const JOB_TYPE_INFO = Object.fromEntries(
  getAvailableJobTypes().map((j) => [j.type, j])
)

const TRIGGER_LABELS: Record<string, string> = {
  'recording:completed': 'When a recording is completed',
  'tag:created': 'When a tag is added',
  'confidence:recorded': 'When confidence is recorded',
  'annotation:created': 'When a note is added',
}

function WorkflowCard({ workflow }: { workflow: WorkflowWithJobs }) {
  const toggleWorkflow = useToggleWorkflow()
  const createOverride = useCreateWorkspaceOverride()
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const isEnabled = workflow.enabled === 1
  const isDefault = workflow.workspace_id === null

  const handleToggle = () => {
    if (isDefault) {
      createOverride.mutate(
        { defaultWorkflow: { ...workflow, enabled: isEnabled ? 0 : 1 }, workspaceId },
      )
    } else {
      toggleWorkflow.mutate({ workflowId: workflow.id, enabled: !isEnabled })
    }
  }

  const triggerLabel = TRIGGER_LABELS[workflow.trigger_event] ?? workflow.trigger_event
  const conditionLabel = workflow.condition_field && workflow.condition_value
    ? `${workflow.condition_field} = "${workflow.condition_value}"`
    : null

  return (
    <div className={cn(
      'rounded-lg border p-3 transition-all',
      isEnabled
        ? 'border-accent/20 bg-accent/5'
        : 'border-border-subtle bg-surface opacity-60'
    )}>
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
        <Switch checked={isEnabled} onCheckedChange={handleToggle} />
      </div>

      <div className="flex flex-col gap-1.5">
        {workflow.jobs.map((job) => {
          const info = JOB_TYPE_INFO[job.job_type]
          return (
            <div
              key={job.id}
              className="flex items-center gap-2 rounded-md bg-surface-overlay/50 px-2.5 py-1.5"
            >
              <span className={cn(
                'rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                info?.category === 'AI' ? 'bg-purple-500/20 text-purple-400' :
                info?.category === 'Search' ? 'bg-blue-500/20 text-blue-400' :
                info?.category === 'Schedule' ? 'bg-amber-500/20 text-amber-400' :
                'bg-emerald-500/20 text-emerald-400'
              )}>
                {info?.category ?? 'Job'}
              </span>
              <span className="text-xs text-neutral-300">
                {info?.label ?? job.job_type}
              </span>
              {job.delay_ms > 0 && (
                <span className="ml-auto text-[10px] text-neutral-600">
                  +{Math.round(job.delay_ms / 86400000)}d
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

interface WorkflowSettingsDialogProps {
  lensType: string
  onClose: () => void
}

export function WorkflowSettingsDialog({ lensType, onClose }: WorkflowSettingsDialogProps) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { data: workflows, isLoading } = useWorkflowsForLens(lensType, workspaceId)

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border-subtle bg-surface-raised shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-neutral-200">Workflows</h2>
            <span className="rounded bg-surface-overlay px-1.5 py-0.5 text-[10px] text-neutral-500">
              {lensType}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-surface-overlay hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="sm" />
            </div>
          ) : workflows && workflows.length > 0 ? (
            <div className="flex flex-col gap-3">
              {workflows.map((wf) => (
                <WorkflowCard key={wf.id} workflow={wf} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <ZapOff className="h-6 w-6 text-neutral-700" />
              <p className="text-xs text-neutral-500">No workflows configured for this lens</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
