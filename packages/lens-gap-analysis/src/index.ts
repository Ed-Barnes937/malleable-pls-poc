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
}
