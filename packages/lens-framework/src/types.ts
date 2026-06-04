export interface Scope {
  courseTag?: string
  timeframe?: 'week' | 'all'
}

export type ScopeDim = 'courseTag' | 'timeframe'

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
}
