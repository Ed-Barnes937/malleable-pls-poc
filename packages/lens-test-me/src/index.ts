import { Brain } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './TestMeLens'

export const manifest: PanelManifest = {
  id: 'test-me',
  label: 'Test Me',
  icon: Brain,
  description: 'Quiz & confidence',
  category: 'tool',
  reads: ['tags', 'confidence_signals'],
  writes: ['confidence_signals'],
  emits: ['confidence:recorded'],
  load: () => import('./TestMeLens'),
  minWidth: 300,
  minHeight: 250,
  defaultWidth: 400,
  defaultHeight: 350,
}
