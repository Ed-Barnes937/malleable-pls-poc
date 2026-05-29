import { useState } from 'react'
import { Plus, Pencil, Trash2, ChevronRight, ZapOff, AlertTriangle } from 'lucide-react'
import { cn, Switch, Spinner, SectionLabel } from '@pls/shared-ui'
import {
  useWorkflowsForWorkspace,
  useToggleWorkflow,
  useCreateWorkspaceOverride,
  useDeleteWorkflow,
} from '@pls/substrate-client'
import {
  getAvailableJobTypes,
  getAvailableTriggerEvents,
  type WorkflowWithJobs,
} from '@pls/substrate'
import { useWorkspaceStore } from './store'
import { WorkflowEditor } from './WorkflowEditor'

const JOB_TYPE_INFO = Object.fromEntries(getAvailableJobTypes().map((j) => [j.type, j]))
const TRIGGER_LABELS = Object.fromEntries(
  getAvailableTriggerEvents().map((t) => [t.event, t.label]),
)

const DAY_MS = 86400000

function WorkflowCard({
  workflow,
  workspaceId,
  onEdit,
}: {
  workflow: WorkflowWithJobs
  workspaceId: string
  onEdit: (workflow: WorkflowWithJobs) => void
}) {
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
          {!isDefault && (
            <>
              <button
                onClick={() => onEdit(workflow)}
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

type EditorState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; workflow: WorkflowWithJobs }

export function WorkflowSettingsPanel() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { data: rawWorkflows, isLoading, isError, error } = useWorkflowsForWorkspace(workspaceId)
  const workflows = rawWorkflows as unknown as WorkflowWithJobs[] | undefined
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })

  return (
    <div className="flex flex-col gap-2">
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Spinner size="sm" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 py-6 text-center">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <p className="text-[11px] text-red-300">Couldn’t load workflows</p>
          <p className="px-3 text-[10px] text-neutral-600">{error?.message ?? 'Request failed'}</p>
        </div>
      ) : workflows && workflows.length > 0 ? (
        workflows.map((wf) => (
          <WorkflowCard
            key={wf.id}
            workflow={wf}
            workspaceId={workspaceId}
            onEdit={(workflow) => setEditor({ mode: 'edit', workflow })}
          />
        ))
      ) : (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <ZapOff className="h-5 w-5 text-neutral-700" />
          <p className="text-[11px] text-neutral-600">No workflows in this workspace</p>
        </div>
      )}

      <button
        onClick={() => setEditor({ mode: 'create' })}
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-neutral-600 transition-all hover:bg-surface-overlay/50 hover:text-neutral-400"
      >
        <Plus className="h-3.5 w-3.5 shrink-0" />
        New workflow
      </button>

      {editor.mode !== 'closed' && (
        <WorkflowEditor
          key={editor.mode === 'edit' ? editor.workflow.id : 'create'}
          open
          onClose={() => setEditor({ mode: 'closed' })}
          workspaceId={workspaceId}
          workflow={editor.mode === 'edit' ? editor.workflow : undefined}
        />
      )}
    </div>
  )
}
