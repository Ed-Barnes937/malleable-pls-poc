import { describe, it, expectTypeOf } from 'vitest'
import type { Scope, LensCategory, LensProps } from './types'

describe('Scope', () => {
  it('can be empty', () => {
    const scope: Scope = {}
    expectTypeOf(scope).toMatchTypeOf<Scope>()
  })

  it('can have all fields populated', () => {
    const scope: Scope = {
      courseTag: 'cs101',
      timeframe: 'week',
    }
    expectTypeOf(scope).toMatchTypeOf<Scope>()
  })

  it('timeframe accepts "week" or "all"', () => {
    expectTypeOf<Scope['timeframe']>().toEqualTypeOf<'week' | 'all' | undefined>()
  })
})

describe('LensCategory', () => {
  it('accepts "tool" and "view"', () => {
    const tool: LensCategory = 'tool'
    const view: LensCategory = 'view'
    expectTypeOf<typeof tool>().toMatchTypeOf<LensCategory>()
    expectTypeOf<typeof view>().toMatchTypeOf<LensCategory>()
  })

  it('is the union "tool" | "view"', () => {
    expectTypeOf<LensCategory>().toEqualTypeOf<'tool' | 'view'>()
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
