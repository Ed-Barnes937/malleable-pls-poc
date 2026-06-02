import { useState } from 'react'
import { Dialog, cn } from '@pls/shared-ui'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import {
  getAvailableJobTypes,
  getTriggerEventsForLens,
  type WorkflowWithJobs,
} from '@pls/substrate'
import { useManifest } from '@pls/lens-framework'
import { useCreateWorkflow, useUpdateWorkflow } from '@pls/substrate-client'

const JOB_TYPES = getAvailableJobTypes()
const DAY_MS = 86400000

interface JobDraft {
  jobType: string
  delayMs: number
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
      workflow?.jobs.map((j) => ({ jobType: j.job_type, delayMs: j.delay_ms })) ?? [],
  )

  const createWorkflow = useCreateWorkflow()
  const updateWorkflow = useUpdateWorkflow()
  const isPending = createWorkflow.isPending || updateWorkflow.isPending

  const addJob = () => {
    const used = new Set(jobs.map((j) => j.jobType))
    const next = JOB_TYPES.find((t) => !used.has(t.type)) ?? JOB_TYPES[0]
    if (next) setJobs((prev) => [...prev, { jobType: next.type, delayMs: 0 }])
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

  const selectClass =
    'w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-neutral-200 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20'
  const labelClass = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-500'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit workflow' : 'New workflow'}
      className="w-full max-w-md"
    >
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
        <div>
          <label className={labelClass}>Trigger</label>
          <select value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)} className={selectClass}>
            {triggerEvents.map((t) => (
              <option key={t.event} value={t.event}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Condition field</label>
            <input
              value={conditionField}
              onChange={(e) => setConditionField(e.target.value)}
              placeholder="optional"
              className={selectClass}
            />
          </div>
          <div>
            <label className={labelClass}>Equals</label>
            <input
              value={conditionValue}
              onChange={(e) => setConditionValue(e.target.value)}
              placeholder="optional"
              className={selectClass}
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className={labelClass}>Jobs</label>
            <button
              type="button"
              onClick={addJob}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-accent transition-colors hover:bg-accent/10"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          </div>
          {jobs.length === 0 ? (
            <p className="rounded-md border border-dashed border-border-subtle px-2.5 py-3 text-center text-[10px] text-neutral-600">
              No jobs — add at least one
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {jobs.map((job, idx) => (
                <div key={idx} className="flex items-center gap-1.5 rounded-md bg-surface-overlay/50 px-2 py-1.5">
                  <select
                    value={job.jobType}
                    onChange={(e) => updateJob(idx, { jobType: e.target.value })}
                    className="min-w-0 flex-1 rounded border border-border-subtle bg-surface px-1.5 py-1 text-[11px] text-neutral-200 focus:border-accent/40 focus:outline-none"
                  >
                    {JOB_TYPES.map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={Math.round(job.delayMs / DAY_MS)}
                    onChange={(e) => updateJob(idx, { delayMs: Math.max(0, Number(e.target.value)) * DAY_MS })}
                    title="Delay (days)"
                    className="w-12 rounded border border-border-subtle bg-surface px-1.5 py-1 text-[11px] text-neutral-200 focus:border-accent/40 focus:outline-none"
                  />
                  <span className="text-[9px] text-neutral-600">d</span>
                  <button
                    type="button"
                    onClick={() => moveJob(idx, -1)}
                    disabled={idx === 0}
                    className="rounded p-0.5 text-neutral-600 transition-colors hover:text-neutral-300 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveJob(idx, 1)}
                    disabled={idx === jobs.length - 1}
                    className="rounded p-0.5 text-neutral-600 transition-colors hover:text-neutral-300 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeJob(idx)}
                    className="rounded p-0.5 text-neutral-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
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
            className="rounded-md px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-surface-overlay hover:text-neutral-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || jobs.length === 0 || !triggerEvent}
            className={cn(
              'rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/80',
              'disabled:opacity-40',
            )}
          >
            {isPending ? 'Saving…' : isEditing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
