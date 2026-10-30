import { describe, it, expectTypeOf } from 'vitest'
import type { Scope, ScopeDeclaration, LensProps } from './types'
import type { SplitScope } from './scope'

describe('Scope', () => {
  it('can be empty', () => {
    const scope: Scope = {}
    expectTypeOf(scope).toMatchTypeOf<Scope>()
  })

  it('can have all fields populated', () => {
    const scope: Scope = {
      courseTag: 'cs101',
      lectureId: 'lec-1',
    }
    expectTypeOf(scope).toMatchTypeOf<Scope>()
  })
})

describe('ScopeDeclaration', () => {
  it('expresses the planning widgets of the scope target table', () => {
    // Calendar, To-do and Coming up do not exist yet; their declarations
    // must already be expressible (plan T2 target table).
    const calendar: ScopeDeclaration = { courseTag: 'highlight', lectureId: 'highlight' }
    const todo: ScopeDeclaration = { courseTag: 'filter', lectureId: 'highlight' }
    const comingUp: ScopeDeclaration = { courseTag: 'filter', lectureId: 'highlight' }
    expectTypeOf(calendar).toMatchTypeOf<ScopeDeclaration>()
    expectTypeOf(todo).toMatchTypeOf<ScopeDeclaration>()
    expectTypeOf(comingUp).toMatchTypeOf<ScopeDeclaration>()
  })

  it('keeps course and lecture modes distinct', () => {
    expectTypeOf<ScopeDeclaration['courseTag']>().toEqualTypeOf<'filter' | 'highlight' | 'ignore' | undefined>()
    expectTypeOf<ScopeDeclaration['lectureId']>().toEqualTypeOf<'target' | 'highlight' | 'ignore' | undefined>()
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

  it('carries reader scope and highlight-only scope as separate props', () => {
    // `scope` is what readers may filter by; `highlight` is styling only.
    expectTypeOf<LensProps['highlight']>().toEqualTypeOf<Scope | undefined>()
    expectTypeOf<SplitScope>().toEqualTypeOf<{ scope: Scope; highlight: Scope }>()
  })
})
