import type { ComponentType } from 'react'

export interface Scope {
  courseTag?: string
  recordingId?: string
  timeframe?: 'week' | 'all'
}

export type LensCategory = 'tool' | 'view' | 'both'

export interface LensMeta {
  label: string
  icon: ComponentType<{ className?: string }>
  description: string
  category: LensCategory
}

export interface LensProps {
  panelId: string
  scope: Scope
  config: Record<string, unknown>
}
