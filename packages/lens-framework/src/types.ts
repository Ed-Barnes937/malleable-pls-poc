export interface Scope {
  courseTag?: string
  timeframe?: 'week' | 'all'
  recordingId?: string
}

export type ScopeDim = 'courseTag' | 'timeframe' | 'recordingId'

export type LensCategory = 'tool' | 'view'

export interface LensProps {
  panelId: string
  scope: Scope
  config: Record<string, unknown>
  /**
   * Patch the panel's persisted config. Shallow-merged with current config.
   * Optional because not all hosts (e.g. component tests) wire it up.
   */
  onConfigChange?: (patch: Record<string, unknown>) => void
  /**
   * Patch the workspace-level scope shared by every panel, e.g. to focus a
   * recording the lens just created. `undefined` clears a dimension. Optional
   * for the same reason as `onConfigChange`.
   */
  onScopeChange?: (patch: Partial<Scope>) => void
}
