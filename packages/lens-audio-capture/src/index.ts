import { Mic } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './AudioCaptureLens'

export const manifest: PanelManifest = {
  id: 'audio-capture',
  label: 'Audio Capture',
  icon: Mic,
  description: 'Record or upload a lecture',
  group: 'capture',
  // Course: files a new lecture under it. Recording: works on the focused lecture.
  scope: { courseTag: 'filter', recordingId: 'target' },
  reads: ['recordings'],
  writes: ['recordings'],
  // recording:transcribed comes from the transcribe job this widget's upload starts.
  emits: ['recording:completed', 'recording:transcribed'],
  load: () => import('./AudioCaptureLens'),
  minWidth: 280,
  minHeight: 200,
  defaultWidth: 380,
  defaultHeight: 280,
}
