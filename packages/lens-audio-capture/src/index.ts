import { Mic } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './AudioCaptureLens'

export const manifest: PanelManifest = {
  id: 'audio-capture',
  label: 'Audio Capture',
  icon: Mic,
  description: 'Record & playback',
  category: 'tool',
  filters: ['recordingId'] as const,
  reads: ['recordings'],
  writes: ['recordings'],
  emits: ['recording:completed'],
  load: () => import('./AudioCaptureLens'),
  minWidth: 280,
  minHeight: 200,
  defaultWidth: 380,
  defaultHeight: 280,
}
