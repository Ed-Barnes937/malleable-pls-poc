import { Link2 } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './ConnectionsLens'

export const manifest: PanelManifest = {
  id: 'connections',
  label: 'Connections',
  icon: Link2,
  description: 'Cross-lecture links',
  category: 'view',
  reads: ['links'],
  load: () => import('./ConnectionsLens'),
  minWidth: 280,
  minHeight: 200,
  defaultWidth: 400,
  defaultHeight: 320,
}
