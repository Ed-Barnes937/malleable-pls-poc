import { CalendarDays } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'

export { default } from './CalendarLens'
export { HelpMePlanButton, HelpMePlanPanel, type HelpMePlanPanelProps } from './HelpMePlan'
export { ProposalTray } from './ProposalTray'
export { acceptPatch, ghostRow, useProposalLayer, type Proposal, type ProposalLayer } from './proposals'
export { buildAutofillDraft, type AutofillDraft } from './autofill'

export const manifest: PanelManifest = {
  id: 'calendar',
  label: 'Calendar',
  group: 'plan',
  icon: CalendarDays,
  description: 'Your week of classes and study time',
  // Shows every course and dims the others: scope controls what is
  // emphasised, never what is true (other courses' commitments still count).
  scope: { courseTag: 'highlight', recordingId: 'highlight' },
  reads: ['plan_items', 'recordings'],
  writes: ['plan_items'],
  emits: ['plan-item:created', 'plan-item:updated', 'plan-item:completed'],
  load: () => import('./CalendarLens'),
  minWidth: 520,
  minHeight: 420,
  defaultWidth: 900,
  defaultHeight: 640,
}
