import type { Scope } from '@pls/substrate'

export interface LensProps {
  panelId: string
  scope: Scope
  config: Record<string, unknown>
}
