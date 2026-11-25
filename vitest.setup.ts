import '@testing-library/jest-dom/vitest'
import { expect, vi } from 'vitest'

// Cost guardrail: no test may reach a real AI provider. Force the fakes even
// if the shell exported live settings (see apps/server/src/ai/deps.ts).
process.env.AI_MODE = 'mock'
delete process.env.OPENROUTER_API_KEY

// Integration tests make dozens of sequential round trips to a shared Postgres.
// Their cost is I/O latency, not CPU, so it balloons when the machine or the
// database is busy (several suites at once, CI). A test that times out keeps
// running and then pollutes the shared fixtures of the tests after it, which
// shows up as unrelated count mismatches. Give them room; unit tests keep the
// default 5s so a slow one is still noticed.
if (expect.getState().testPath?.endsWith('.db.test.ts')) {
  vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })
}

// UI SDK popups (Popover, Dialog, Menu, ...) use the browser's top layer and
// the Web Animations API, which jsdom lacks. These are the stubs from UI SDK's
// testing docs ("Testing in a Framework"): enough for a popup to render and
// open. They don't exercise native popup or animation behaviour; use Playwright
// CT for that. Assert ARIA with `checkPattern` (see packages/shared-ui/src/testing.ts).
if (typeof HTMLElement !== 'undefined') {
  HTMLElement.prototype.showPopover ??= function () {}
  HTMLElement.prototype.hidePopover ??= function () {}
  Element.prototype.getAnimations ??= () => []
  // A modal Dialog locks page scroll and asks CSS.supports, which jsdom lacks.
  CSS.supports ??= () => false
  // jsdom has no layout, so UI SDK's focus trap would find nothing visible to
  // Tab to. Treat what isn't hidden (attribute, display or visibility) as visible.
  Element.prototype.checkVisibility ??= function (this: Element) {
    for (let el: Element | null = this; el; el = el.parentElement) {
      if (el.hasAttribute('hidden') || getComputedStyle(el).display === 'none') return false
    }
    return getComputedStyle(this).visibility !== 'hidden'
  }
  document.head.append(
    Object.assign(document.createElement('style'), {
      textContent: '[popover] { display: block !important }',
    }),
  )
}
