export function getAvailableJobTypes(): { type: string; label: string; category: string }[] {
  return [
    { type: 'ai:transcribe', label: 'Generate transcript', category: 'AI' },
    { type: 'search:related-docs', label: 'Search related documents', category: 'Search' },
    { type: 'schedule:quiz', label: 'Schedule quiz review', category: 'Schedule' },
    { type: 'ai:generate-questions', label: 'Generate practice questions', category: 'AI' },
    { type: 'ai:find-connections', label: 'Find cross-lecture connections', category: 'AI' },
  ]
}

export function getAvailableTriggerEvents(): { event: string; label: string }[] {
  return [
    { event: 'recording:completed', label: 'When a recording is completed' },
    { event: 'tag:created', label: 'When a tag is added' },
    { event: 'confidence:recorded', label: 'When confidence is recorded' },
    { event: 'annotation:created', label: 'When a note is added' },
    { event: 'plan-item:created', label: 'When something is added to your plan' },
    { event: 'plan-item:updated', label: 'When something in your plan changes' },
    { event: 'plan-item:completed', label: 'When something in your plan is done' },
  ]
}

export function getTriggerEventsForLens(emits: readonly string[]): { event: string; label: string }[] {
  const allowed = new Set(emits)
  return getAvailableTriggerEvents().filter((t) => allowed.has(t.event))
}
