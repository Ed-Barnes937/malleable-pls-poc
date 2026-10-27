import { CalendarClock } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './ComingUpLens'

export const manifest: PanelManifest = {
  id: 'coming-up',
  label: 'Coming up',
  icon: CalendarClock,
  description: 'Deadlines ahead, day by day',
  group: 'plan',
  // Course filters (with "+N in other courses"); a focused lecture highlights
  // deadlines linked to it.
  scope: { courseTag: 'filter', recordingId: 'highlight' },
  reads: ['plan_items'],
  load: () => import('./ComingUpLens'),
  minWidth: 260,
  minHeight: 200,
  defaultWidth: 360,
  defaultHeight: 320,
}
