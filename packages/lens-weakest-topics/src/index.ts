import { AlertTriangle } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './WeakestTopicsLens'

export const manifest: PanelManifest = {
  id: 'weakest-topics',
  label: 'Weakest Topics',
  icon: AlertTriangle,
  description: 'Moments you feel least sure about',
  group: 'review',
  scope: { courseTag: 'filter', recordingId: 'ignore' },
  reads: ['weakest_topics'],
  load: () => import('./WeakestTopicsLens'),
  minWidth: 200,
  minHeight: 150,
  defaultWidth: 340,
  defaultHeight: 400,
}
