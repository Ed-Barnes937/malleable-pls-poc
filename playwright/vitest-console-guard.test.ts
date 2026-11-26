import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

const root = resolve(__dirname, '..')

type Report = { testResults: { message: string; assertionResults: { title: string; status: string }[] }[] }

// Runs vitest-console-guard/probe.ts in a child vitest, with the repo's setup
// file, and checks what the console.error guard in vitest.setup.ts fails.
it('the vitest console.error guard fails what it should and passes what it should', () => {
  let report: Report
  const dir = mkdtempSync(join(tmpdir(), 'vitest-guard-probe-'))
  const out = join(dir, 'report.json')
  try {
    const run = spawnSync(
      resolve(root, 'node_modules/.bin/vitest'),
      ['run', '--config', 'playwright/vitest-console-guard/probe.config.ts', '--reporter=json', `--outputFile=${out}`],
      { cwd: root, encoding: 'utf8' },
    )
    expect(run.status).not.toBe(0)
    report = JSON.parse(readFileSync(out, 'utf8')) as Report
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const [file] = report.testResults
  const status = Object.fromEntries(file.assertionResults.map((t) => [t.title, t.status]))
  expect(status).toEqual({
    'clean': 'passed',
    'logs during the test': 'failed',
    'spies on an expected error': 'passed',
    'leaves a setTimeout(0) behind as the last test': 'passed',
  })
  // The error left after the last test fails the file (afterAll).
  expect(file.message).toContain('after the last test in this file')
  expect(file.message).toContain('probe: after the last test')
}, 60_000)
