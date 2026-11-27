import { globSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CT_SPECS, E2E_SPECS } from './spec-files'

const root = resolve(__dirname, '..')
// The same places the Playwright configs look (Playwright skips node_modules).
const specs = globSync([E2E_SPECS, CT_SPECS].map(({ testDir, testMatch }) => join(testDir, testMatch)), {
  cwd: root,
  exclude: (path) => path.includes('node_modules'),
})

// The console guard is an auto fixture on the suites' own `test`
// (playwright/fixtures.ts, e2e/test.ts): a spec that takes `test` straight
// from Playwright would silently run without it.
describe('every Playwright spec runs with the console guard', () => {
  it('finds the specs of both suites', () => {
    expect(specs.filter((spec) => spec.endsWith('.e2e.ts')).length).toBeGreaterThan(20)
    expect(specs.filter((spec) => /\.iwft\.tsx?$/.test(spec)).length).toBeGreaterThan(20)
  })

  it.each(specs)('%s imports test from the shared fixtures', (spec) => {
    const source = readFileSync(resolve(root, spec), 'utf8')
    const direct = /^import \{[^}]*\btest\b[^}]*\} from '@playwright\/(test|experimental-ct-react)'/m
    expect(source).not.toMatch(direct)
    expect(source).toMatch(/^import \{[^}]*\btest\b[^}]*\} from '[./]+(playwright\/fixtures|test)'/m)
  })
})
