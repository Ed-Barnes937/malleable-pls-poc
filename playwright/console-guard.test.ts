import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const specs = globSync(['e2e/**/*.e2e.ts', 'packages/*/src/**/*.iwft.tsx'], { cwd: root })

// The console guard is an auto fixture on the suites' own `test`
// (playwright/fixtures.ts, e2e/test.ts): a spec that takes `test` straight
// from Playwright would silently run without it.
describe('every Playwright spec runs with the console guard', () => {
  it('finds the specs', () => {
    expect(specs.length).toBeGreaterThan(30)
  })

  it.each(specs)('%s imports test from the shared fixtures', (spec) => {
    const source = readFileSync(resolve(root, spec), 'utf8')
    const direct = /^import \{[^}]*\btest\b[^}]*\} from '@playwright\/(test|experimental-ct-react)'/m
    expect(source).not.toMatch(direct)
    expect(source).toMatch(/^import \{[^}]*\btest\b[^}]*\} from '[./]+(playwright\/fixtures|test)'/m)
  })
})
