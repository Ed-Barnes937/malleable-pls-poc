import { Mic } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './AudioCaptureLens'

export const manifest: PanelManifest = {
  id: 'audio-capture',
  label: 'Audio Capture',
  icon: Mic,
  description: 'Record & playback',
  category: 'tool',
  reads: ['recordings'],
  writes: ['recordings'],
  load: () => import('./AudioCaptureLens'),
}
