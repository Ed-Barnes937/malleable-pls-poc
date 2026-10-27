import { FileText } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './TranscriptLens'

export const manifest: PanelManifest = {
  id: 'transcript',
  label: 'Transcript',
  icon: FileText,
  description: 'Segments & tags',
  // Course narrows the lecture picker (focus clears when it leaves the course).
  scope: { courseTag: 'filter', recordingId: 'target' },
  // Scrolls to and highlights a moment other widgets ask to show.
  showsMoments: true,
  reads: ['transcript_segments', 'tags', 'annotations', 'recordings'],
  writes: ['tags', 'annotations'],
  emits: ['tag:created', 'annotation:created'],
  load: () => import('./TranscriptLens'),
  minWidth: 300,
  minHeight: 250,
  defaultWidth: 420,
  defaultHeight: 380,
}
