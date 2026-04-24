import { describe, it, expectTypeOf } from 'vitest'
import type { ComponentType } from 'react'
import type { Scope, LensCategory, LensMeta, LensProps } from './types'

describe('Scope', () => {
  it('can be empty', () => {
    const scope: Scope = {}
    expectTypeOf(scope).toMatchTypeOf<Scope>()
  })

  it('can have all fields populated', () => {
    const scope: Scope = {
      courseTag: 'cs101',
      recordingId: 'rec_1',
      timeframe: 'week',
    }
    expectTypeOf(scope).toMatchTypeOf<Scope>()
  })

  it('timeframe accepts "week" or "all"', () => {
    expectTypeOf<Scope['timeframe']>().toEqualTypeOf<'week' | 'all' | undefined>()
  })
})

describe('LensCategory', () => {
  it('accepts "tool", "view", and "both"', () => {
    const tool: LensCategory = 'tool'
    const view: LensCategory = 'view'
    const both: LensCategory = 'both'
    expectTypeOf<typeof tool>().toMatchTypeOf<LensCategory>()
    expectTypeOf<typeof view>().toMatchTypeOf<LensCategory>()
    expectTypeOf<typeof both>().toMatchTypeOf<LensCategory>()
  })

  it('is the union "tool" | "view" | "both"', () => {
    expectTypeOf<LensCategory>().toEqualTypeOf<'tool' | 'view' | 'both'>()
  })
})

describe('LensMeta', () => {
  it('requires label, icon, description, category', () => {
    const Icon: ComponentType<{ className?: string }> = () => null
    const meta: LensMeta = {
      label: 'Test',
      icon: Icon,
      description: 'A test lens',
      category: 'view',
    }
    expectTypeOf(meta).toMatchTypeOf<LensMeta>()
    expectTypeOf<LensMeta['label']>().toEqualTypeOf<string>()
    expectTypeOf<LensMeta['description']>().toEqualTypeOf<string>()
    expectTypeOf<LensMeta['category']>().toEqualTypeOf<LensCategory>()
  })
})

describe('LensProps', () => {
  it('requires panelId, scope, config', () => {
    const props: LensProps = {
      panelId: 'p1',
      scope: {},
      config: {},
    }
    expectTypeOf(props).toMatchTypeOf<LensProps>()
    expectTypeOf<LensProps['panelId']>().toEqualTypeOf<string>()
    expectTypeOf<LensProps['scope']>().toEqualTypeOf<Scope>()
    expectTypeOf<LensProps['config']>().toEqualTypeOf<Record<string, unknown>>()
  })
})
