import { useState } from 'react'
import { Dialog, Select, TextField, cn } from '@pls/shared-ui'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import {
  DEFAULT_REVIEW_PARAMS,
  getAvailableJobTypes,
  getJobTypesForTrigger,
  getTriggerEventsForLens,
  REVIEW_TASK_JOB,
  type WorkflowWithJobs,
} from '@pls/substrate'
import { useManifest } from '@pls/lens-framework'
import { useCreateWorkflow, useUpdateWorkflow } from '@pls/substrate-client'

const JOB_LABELS = new Map(getAvailableJobTypes().map((j) => [j.type, j.label]))
const DAY_MS = 86400000

interface JobDraft {
  jobType: string
  delayMs: number
  params: Record<string, unknown>
}

function defaultParams(jobType: string): Record<string, unknown> {
  return jobType === REVIEW_TASK_JOB ? { ...DEFAULT_REVIEW_PARAMS } : {}
}

interface WorkflowEditorProps {
  open: boolean
  onClose: () => void
  workspaceId: string
  /** Lens this workflow is attached to. Determines which trigger events are selectable. */
  sourceLens: string
  /** Provided when editing an existing workflow; omitted when creating. */
  workflow?: WorkflowWithJobs
}

export function WorkflowEditor({ open, onClose, workspaceId, sourceLens, workflow }: WorkflowEditorProps) {
  const manifest = useManifest(sourceLens)
  const triggerEvents = getTriggerEventsForLens(manifest?.emits ?? [])
  const isEditing = !!workflow

  const [triggerEvent, setTriggerEvent] = useState(
    () => workflow?.trigger_event ?? triggerEvents[0]?.event ?? '',
  )
  const [conditionField, setConditionField] = useState(() => workflow?.condition_field ?? '')
  const [conditionValue, setConditionValue] = useState(() => workflow?.condition_value ?? '')
  const [jobs, setJobs] = useState<JobDraft[]>(
    () =>
      workflow?.jobs.map((j) => ({ jobType: j.job_type, delayMs: j.delay_ms, params: j.params ?? {} })) ?? [],
  )

  const createWorkflow = useCreateWorkflow()
  const updateWorkflow = useUpdateWorkflow()
  const isPending = createWorkflow.isPending || updateWorkflow.isPending

  // Only steps that understand the trigger's event are offered.
  const jobTypes = getJobTypesForTrigger(triggerEvent)
  // Keep a step whose type no longer fits listed, so it is visible, not silently dropped.
  const optionsFor = (current: string) =>
    jobTypes.some((t) => t.type === current) ? jobTypes : [...jobTypes, { type: current, label: JOB_LABELS.get(current) ?? current }]

  const addJob = () => {
    const used = new Set(jobs.map((j) => j.jobType))
    const next = jobTypes.find((t) => !used.has(t.type)) ?? jobTypes[0]
    if (next) setJobs((prev) => [...prev, { jobType: next.type, delayMs: 0, params: defaultParams(next.type) }])
  }

  const removeJob = (idx: number) => setJobs((prev) => prev.filter((_, i) => i !== idx))

  const moveJob = (idx: number, dir: -1 | 1) => {
    setJobs((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  const updateJob = (idx: number, patch: Partial<JobDraft>) =>
    setJobs((prev) => prev.map((j, i) => (i === idx ? { ...j, ...patch } : j)))

  const handleSave = () => {
    const jobPayload = jobs.map((j, i) => ({
      jobType: j.jobType,
      params: j.params,
      sortOrder: i,
      delayMs: j.delayMs,
    }))
    const condition = {
      conditionField: conditionField.trim() || null,
      conditionValue: conditionValue.trim() || null,
    }

    if (isEditing && workflow) {
      updateWorkflow.mutate(
        {
          workflowId: workflow.id,
          triggerEvent,
          ...condition,
          enabled: !!workflow.enabled,
          jobs: jobPayload,
        },
        { onSuccess: onClose },
      )
    } else {
      createWorkflow.mutate(
        {
          workspaceId,
          sourceLens,
          triggerEvent,
          ...condition,
          enabled: true,
          jobs: jobPayload,
        },
        { onSuccess: onClose },
      )
    }
  }

  const labelClass = 'mb-1.5 block text-meta font-semibold text-text-muted'
  const smallControl =
    'h-8 rounded-item border border-border bg-surface-raised px-2 text-body text-text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line'
  const stepButton =
    'rounded-item p-1 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit automation' : 'New automation'}
      className="w-full max-w-md"
    >
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
        <div>
          <label className={labelClass}>When</label>
          <Select value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)}>
            {triggerEvents.map((t) => (
              <option key={t.event} value={t.event}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Only when (optional)</label>
            <TextField
              value={conditionField}
              onChange={(e) => setConditionField(e.target.value)}
              placeholder="e.g. label"
            />
          </div>
          <div>
            <label className={labelClass}>Is</label>
            <TextField
              value={conditionValue}
              onChange={(e) => setConditionValue(e.target.value)}
              placeholder="e.g. confused"
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className={cn(labelClass, 'mb-0')}>Then</label>
            <button
              type="button"
              onClick={addJob}
              disabled={jobTypes.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-item px-2 text-meta font-semibold text-accent transition-colors hover:bg-accent-soft disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Add step
            </button>
          </div>
          {jobs.length === 0 ? (
            <p className="rounded-item border border-dashed border-border px-3 py-3 text-center text-meta text-text-muted">
              {jobTypes.length === 0 ? 'Nothing can run after this yet' : 'No steps yet - add at least one'}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {jobs.map((job, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-1.5 rounded-item bg-surface-inset p-2">
                  <select
                    value={job.jobType}
                    onChange={(e) => updateJob(idx, { jobType: e.target.value, params: defaultParams(e.target.value) })}
                    aria-label={`Step ${idx + 1}`}
                    className={cn(smallControl, 'min-w-0 basis-full')}
                  >
                    {optionsFor(job.jobType).map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <label className="mr-auto flex items-center gap-1.5 text-meta text-text-muted">
                    wait
                    <input
                      type="number"
                      min={0}
                      value={Math.round(job.delayMs / DAY_MS)}
                      onChange={(e) => updateJob(idx, { delayMs: Math.max(0, Number(e.target.value)) * DAY_MS })}
                      aria-label={`Days to wait before step ${idx + 1}`}
                      className={cn(smallControl, 'w-12')}
                    />
                    days
                  </label>
                  <button
                    type="button"
                    onClick={() => moveJob(idx, -1)}
                    aria-label="Move step up"
                    title="Move step up"
                    disabled={idx === 0}
                    className={stepButton}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveJob(idx, 1)}
                    aria-label="Move step down"
                    title="Move step down"
                    disabled={idx === jobs.length - 1}
                    className={stepButton}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeJob(idx)}
                    aria-label="Remove step"
                    title="Remove step"
                    className="rounded-item p-1 text-text-muted transition-colors hover:bg-confused-soft hover:text-confused"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-control px-3 text-body font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || jobs.length === 0 || !triggerEvent}
            className={cn(
              'inline-flex h-10 items-center rounded-control bg-accent px-4 text-body font-semibold text-accent-foreground transition-opacity hover:opacity-90',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {isPending ? 'Saving…' : isEditing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
