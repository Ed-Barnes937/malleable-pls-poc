// Run only by ../vitest-console-guard.test.ts (through probe.config.ts), to
// see which of these the console.error guard in vitest.setup.ts fails.
import { it, vi } from 'vitest'

it('clean', () => {})

it('logs during the test', () => {
  console.error('probe: during')
})

it('spies on an expected error', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  console.error('probe: expected')
  spy.mockRestore()
})

it('leaves a setTimeout(0) behind as the last test', () => {
  setTimeout(() => console.error('probe: after the last test'), 0)
})
