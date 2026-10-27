import type { PanelManifest, WidgetGroup } from '@pls/lens-framework'

/**
 * Palette groups, in display order, named for what a student wants to do.
 * A widget joins one by declaring `group` on its manifest; widgets without
 * one land in "More widgets" so nothing registered is ever missing.
 */
export const WIDGET_GROUPS: { id: WidgetGroup; label: string }[] = [
  { id: 'capture', label: 'Capture' },
  { id: 'study', label: 'Study' },
  { id: 'plan', label: 'Plan' },
  { id: 'review', label: 'Review' },
]

export interface WidgetGroupSection {
  id: WidgetGroup | 'other'
  label: string
  widgets: PanelManifest[]
}

/** Groups manifests for the palette, keeping registry order inside a group and dropping empty groups. */
export function groupWidgets(manifests: PanelManifest[]): WidgetGroupSection[] {
  const known = new Set<string>(WIDGET_GROUPS.map((g) => g.id))
  const sections: WidgetGroupSection[] = WIDGET_GROUPS.map((g) => ({
    ...g,
    widgets: manifests.filter((m) => m.group === g.id),
  }))
  sections.push({
    id: 'other',
    label: 'More widgets',
    widgets: manifests.filter((m) => !m.group || !known.has(m.group)),
  })
  return sections.filter((s) => s.widgets.length > 0)
}
