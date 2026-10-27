import { Brain } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './TestMeLens'

export const manifest: PanelManifest = {
  id: 'test-me',
  label: 'Test Me',
  icon: Brain,
  description: 'Quiz yourself',
  group: 'study',
  scope: { courseTag: 'filter', recordingId: 'ignore' },
  reads: ['tags', 'confidence_signals'],
  writes: ['confidence_signals'],
  emits: ['confidence:recorded'],
  load: () => import('./TestMeLens'),
  minWidth: 300,
  minHeight: 250,
  defaultWidth: 420,
  defaultHeight: 470,
}
