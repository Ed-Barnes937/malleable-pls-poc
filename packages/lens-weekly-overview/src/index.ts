import { BarChart3 } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './WeeklyOverviewLens'

export const manifest: PanelManifest = {
  id: 'weekly-overview',
  label: 'This Week',
  icon: BarChart3,
  description: 'Progress by course',
  category: 'view',
  reads: ['weekly_overview'],
  load: () => import('./WeeklyOverviewLens'),
  minWidth: 350,
  minHeight: 250,
  defaultWidth: 460,
  defaultHeight: 340,
}
