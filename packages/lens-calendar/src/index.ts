import { CalendarDays } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './CalendarLens'
export { HelpMePlan, type HelpMePlanProps } from './HelpMePlan'

export const manifest: PanelManifest = {
  id: 'calendar',
  label: 'Calendar',
  icon: CalendarDays,
  description: 'Your week: classes, study time and deadlines',
  // Shows every course and dims the others: scope controls what is
  // emphasised, never what is true (other courses' commitments still count).
  scope: { courseTag: 'highlight', recordingId: 'highlight' },
  reads: ['plan_items', 'recordings'],
  writes: ['plan_items'],
  emits: ['plan-item:created', 'plan-item:updated', 'plan-item:completed'],
  load: () => import('./CalendarLens'),
  minWidth: 520,
  minHeight: 420,
  defaultWidth: 900,
  defaultHeight: 640,
}
