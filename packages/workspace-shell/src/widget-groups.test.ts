import { describe, it, expect } from 'vitest'
import type { PanelManifest, WidgetGroup } from '@pls/lens-framework'
import { groupWidgets } from './widget-groups'

function m(id: string, group?: WidgetGroup | string): PanelManifest {
  return {
    id,
    label: id,
    icon: () => null,
    description: '',
    reads: [],
    group: group as WidgetGroup | undefined,
    load: async () => ({ default: () => null }),
  }
}

describe('groupWidgets', () => {
  it('orders groups capture, study, plan, review and drops empty ones', () => {
    const groups = groupWidgets([m('a', 'review'), m('b', 'capture'), m('c', 'study')])
    expect(groups.map((g) => g.id)).toEqual(['capture', 'study', 'review'])
  })

  it('keeps registry order inside a group', () => {
    const [study] = groupWidgets([m('x', 'study'), m('y', 'study')])
    expect(study.widgets.map((w) => w.id)).toEqual(['x', 'y'])
  })

  it('slots a new widget in by its declared group', () => {
    const groups = groupWidgets([m('calendar', 'plan'), m('todo', 'plan')])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ id: 'plan', label: 'Plan' })
  })

  it('puts widgets with no or an unknown group under More widgets, last', () => {
    const groups = groupWidgets([m('a'), m('b', 'mystery'), m('c', 'capture')])
    expect(groups.map((g) => g.label)).toEqual(['Capture', 'More widgets'])
    expect(groups[1].widgets.map((w) => w.id)).toEqual(['a', 'b'])
  })
})
