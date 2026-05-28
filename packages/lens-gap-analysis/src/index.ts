import { PieChart } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './GapAnalysisLens'

export const manifest: PanelManifest = {
  id: 'gap-analysis',
  label: 'All Courses',
  icon: PieChart,
  description: 'Coverage overview',
  category: 'view',
  reads: ['gap_analysis'],
  load: () => import('./GapAnalysisLens'),
  minWidth: 350,
  minHeight: 250,
  defaultWidth: 460,
  defaultHeight: 340,
}
