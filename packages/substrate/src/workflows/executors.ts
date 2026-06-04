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
  ]
}

export function getTriggerEventsForLens(emits: readonly string[]): { event: string; label: string }[] {
  const allowed = new Set(emits)
  return getAvailableTriggerEvents().filter((t) => allowed.has(t.event))
}
