import type { PanelManifest } from '@pls/lens-framework'

/**
 * First-run starting points for an empty board, named for what the student
 * wants to do. A starter only adds widgets, listed in workflow order (the
 * order the student uses them in); the group layout (`layoutGroup`) places
 * them in that order, left to right, a column stacking top to bottom when
 * they don't fit in one row. It never adds automations, so it stays a tool
 * and not a workflow.
 */
export interface BoardStarter {
  id: 'plan' | 'capture' | 'revise'
  label: string
  lensTypes: string[]
}

export const BOARD_STARTERS: BoardStarter[] = [
  { id: 'plan', label: 'Plan my time', lensTypes: ['calendar', 'todo', 'coming-up'] },
  { id: 'capture', label: 'Capture a lecture', lensTypes: ['audio-capture', 'transcript', 'resources'] },
  { id: 'revise', label: 'Find what to revise', lensTypes: ['weakest-topics', 'weekly-overview'] },
]

/** The starter's widgets that are registered, in starter order. */
export function starterWidgets(starter: BoardStarter, manifests: ReadonlyArray<PanelManifest>): PanelManifest[] {
  return starter.lensTypes.flatMap((id) => manifests.find((m) => m.id === id) ?? [])
}

/** "Calendar", "Calendar and To-do", "Calendar, To-do and Coming up". */
export function listNames(names: ReadonlyArray<string>): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
