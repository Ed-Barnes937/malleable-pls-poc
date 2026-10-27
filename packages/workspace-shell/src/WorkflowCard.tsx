import { Pencil, Trash2, ChevronRight } from 'lucide-react'
import { ReviewAutomationSentence, reviewJobOf } from './ReviewAutomationSentence'
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

const REVIEW_HEADINGS: Record<string, string> = {
  confused: 'Review what confused you',
  'key-point': 'Review your key points',
  question: 'Review your questions',
}
const HOUR_MS = 3600000

function waitLabel(delayMs: number): string {
  if (delayMs >= DAY_MS) {
    const days = Math.round(delayMs / DAY_MS)
    return `after ${days} ${days === 1 ? 'day' : 'days'}`
  }
  const hours = Math.max(1, Math.round(delayMs / HOUR_MS))
  return `after ${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

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
      ? `only when ${workflow.condition_field === 'label' ? 'the mark' : workflow.condition_field} is "${workflow.condition_value}"`
      : null
  const reviewJob = reviewJobOf(workflow)

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-all',
        isEnabled ? 'border-accent/20 bg-accent/5' : 'border-border-subtle bg-surface opacity-60',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {reviewJob ? (
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              {REVIEW_HEADINGS[workflow.condition_value ?? ''] ?? 'Review what you marked'}
            </p>
          ) : (
            <>
              <p className="text-[11px] font-medium text-neutral-300">{triggerLabel}</p>
              {conditionLabel && (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-neutral-600">
                  <ChevronRight className="h-2.5 w-2.5" />
                  {conditionLabel}
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {showEditDelete && !isDefault && (
            <>
              <button
                onClick={() => onEdit?.(workflow)}
                aria-label="Edit automation"
                className="rounded p-1 text-neutral-600 transition-colors hover:bg-surface-overlay hover:text-neutral-300"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => deleteWorkflow.mutate({ workflowId: workflow.id })}
                aria-label="Delete automation"
                className="rounded p-1 text-neutral-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
          <Switch checked={isEnabled} onCheckedChange={handleToggle} />
        </div>
      </div>

      {reviewJob ? (
        <ReviewAutomationSentence
          key={`${workflow.id}:${reviewJob.id}`}
          workflow={workflow}
          job={reviewJob}
        />
      ) : (
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
                      : info?.category === 'Plan'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-emerald-500/20 text-emerald-400',
                )}
              >
                {info?.category ?? 'Job'}
              </span>
              <span className="text-xs text-neutral-300">{info?.label ?? job.job_type}</span>
              {job.delay_ms > 0 && (
                <span className="ml-auto text-[10px] text-neutral-600">
                  {waitLabel(job.delay_ms)}
                </span>
              )}
            </div>
          )
        })}
      </div>
      )}

      <p className="mt-2 text-[10px] text-neutral-500">
        {isDefault
          ? 'Built in - switching it off here turns it off on this board only'
          : 'Just for this board'}
      </p>
    </div>
  )
}
