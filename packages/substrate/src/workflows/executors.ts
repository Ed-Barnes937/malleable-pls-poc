import { REVIEW_TASK_JOB } from './review-automation'

export interface JobTypeInfo {
  type: string
  label: string
  category: string
  /** Trigger events whose payload this job understands. The builder only offers it for these. */
  triggers: readonly string[]
  /** Toast shown when a run finishes. */
  doneMessage: string
}

/**
 * The jobs a student can pick in the automation builder. Kept in sync by hand
 * with the server registry (apps/server/src/workflows/executors.ts); only jobs
 * whose result the student can see are listed.
 */
export function getAvailableJobTypes(): JobTypeInfo[] {
  return [
    { type: 'ai:transcribe', label: 'Write a transcript', category: 'AI', triggers: ['recording:completed'], doneMessage: 'Transcript ready' },
    { type: 'ai:summarize-lecture', label: 'Write a 3-line summary', category: 'AI', triggers: ['recording:transcribed'], doneMessage: 'Lecture summary ready' },
    { type: REVIEW_TASK_JOB, label: 'Add a review to my plan', category: 'Plan', triggers: ['tag:created'], doneMessage: 'Review added to your plan' },
  ]
}

/** Jobs that make sense after `triggerEvent`. */
export function getJobTypesForTrigger(triggerEvent: string): JobTypeInfo[] {
  return getAvailableJobTypes().filter((j) => j.triggers.includes(triggerEvent))
}

export function getAvailableTriggerEvents(): { event: string; label: string }[] {
  return [
    { event: 'recording:completed', label: 'When a lecture is recorded or uploaded' },
    { event: 'recording:transcribed', label: 'When a lecture transcript is ready' },
    { event: 'tag:created', label: 'When I mark a moment' },
    { event: 'confidence:recorded', label: 'When I say how sure I feel' },
    { event: 'annotation:created', label: 'When I add a note' },
    { event: 'plan-item:created', label: 'When something is added to my plan' },
    { event: 'plan-item:updated', label: 'When something in my plan changes' },
    { event: 'plan-item:completed', label: 'When I finish something in my plan' },
  ]
}

export function getTriggerEventsForLens(emits: readonly string[]): { event: string; label: string }[] {
  const allowed = new Set(emits)
  return getAvailableTriggerEvents().filter((t) => allowed.has(t.event))
}
