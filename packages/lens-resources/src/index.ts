import { Library } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './ResourcesLens'

export const manifest: PanelManifest = {
  id: 'resources',
  label: 'Resources',
  icon: Library,
  description: 'Links and notes for a course or lecture',
  group: 'capture',
  // Course filters (new items go under it, "+N in other courses"); the
  // selected lecture's resources show first, and new items attach to it.
  scope: { courseTag: 'filter', lectureId: 'target' },
  reads: ['resources', 'lectures'],
  writes: ['resources'],
  emits: ['resource:added'],
  load: () => import('./ResourcesLens'),
  minWidth: 280,
  minHeight: 240,
  defaultWidth: 360,
  defaultHeight: 440,
}
