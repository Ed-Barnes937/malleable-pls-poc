import { FileText } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './TranscriptLens'

export const manifest: PanelManifest = {
  id: 'transcript',
  label: 'Transcript',
  icon: FileText,
  description: 'Segments & tags',
  category: 'tool',
  reads: ['transcript_segments', 'tags', 'annotations', 'recordings'],
  writes: ['tags', 'annotations'],
  load: () => import('./TranscriptLens'),
  minWidth: 300,
  minHeight: 250,
  defaultWidth: 420,
  defaultHeight: 380,
}
