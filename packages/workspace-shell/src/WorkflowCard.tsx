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
        'rounded-item border p-3.5 transition-all',
        isEnabled ? 'border-accent-line bg-accent-soft' : 'border-border-subtle bg-surface-inset opacity-60',
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {reviewJob ? (
            <p className="text-meta font-semibold text-text-secondary">
              {REVIEW_HEADINGS[workflow.condition_value ?? ''] ?? 'Review what you marked'}
            </p>
          ) : (
            <>
              <p className="text-body font-semibold text-text-primary">{triggerLabel}</p>
              {conditionLabel && (
                <p className="mt-0.5 flex items-center gap-1 text-meta text-text-muted">
                  <ChevronRight className="h-3 w-3" />
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
                type="button"
                onClick={() => onEdit?.(workflow)}
                aria-label="Edit automation"
                title="Edit automation"
                className="rounded-item p-1.5 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => deleteWorkflow.mutate({ workflowId: workflow.id })}
                aria-label="Delete automation"
                title="Delete automation"
                className="rounded-item p-1.5 text-text-muted transition-colors hover:bg-confused-soft hover:text-confused"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            label={`Automation: ${triggerLabel}`}
          />
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
              className="flex items-center gap-2 rounded-item bg-surface-raised px-2.5 py-2"
            >
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-meta font-semibold',
                  info?.category === 'AI'
                    ? 'bg-accent-soft text-accent'
                    : info?.category === 'Search'
                      ? 'bg-surface-overlay text-text-secondary'
                      : info?.category === 'Plan'
                        ? 'bg-attn-soft text-attn'
                        : 'bg-good-soft text-good',
                )}
              >
                {info?.category ?? 'Job'}
              </span>
              <span className="text-body text-text-primary">{info?.label ?? job.job_type}</span>
              {job.delay_ms > 0 && (
                <span className="ml-auto text-meta text-text-muted">
                  {waitLabel(job.delay_ms)}
                </span>
              )}
            </div>
          )
        })}
      </div>
      )}

      <p className="mt-2 text-meta text-text-muted">
        {isDefault
          ? 'Built-in automation. Turning it on or off only changes this board.'
          : 'Just for this board.'}
      </p>
    </div>
  )
}
