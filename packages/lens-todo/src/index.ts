import { ListTodo } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './TodoLens'

export const manifest: PanelManifest = {
  id: 'todo',
  label: 'To-do',
  icon: ListTodo,
  description: 'Quick to-dos, ticked off as you go',
  group: 'plan',
  // Course filters (new to-dos inherit it); a focused lecture highlights the
  // to-dos made from it.
  scope: { courseTag: 'filter', recordingId: 'highlight' },
  reads: ['plan_items', 'recordings'],
  writes: ['plan_items'],
  // Unticking and dismissing are updates.
  emits: ['plan-item:created', 'plan-item:completed', 'plan-item:updated'],
  load: () => import('./TodoLens'),
  minWidth: 280,
  minHeight: 220,
  defaultWidth: 360,
  defaultHeight: 440,
}
