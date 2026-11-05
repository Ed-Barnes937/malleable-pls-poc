import type { Locator, Page } from '@playwright/test'

/**
 * Waits for every motion in and under `locator` (all its matches) to finish:
 * the app's shared arrival motion briefly scales what arrives (flow audit
 * 03), so measure a box only once it has landed. Endless animations (a
 * spinner) are not waited for.
 */
export async function motionSettled(locator: Locator): Promise<void> {
  await locator.evaluateAll((els) => Promise.all(
    els.flatMap((el) => el.getAnimations({ subtree: true }))
      .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
      .map((a) => a.finished.catch(() => undefined)),
  ))
}

/** Something that left with the shared motion: what it was, and the motion it played. */
export interface Departure {
  /** The data-testids in what left (itself and inside it). */
  testids: string[]
  animation: string
}

/**
 * Notes everything that starts leaving (`data-leaving`, kept a moment for its
 * motion) as it is added or marked, with the CSS animation it plays, so a
 * test sees each departure without racing its 200ms.
 */
export async function recordDepartures(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: unknown[] = []
    ;(window as unknown as { __departures: unknown[] }).__departures = seen
    const note = (el: Element) => {
      const ids = [el, ...el.querySelectorAll('[data-testid]')].map((x) => x.getAttribute('data-testid')).filter(Boolean)
      seen.push({ testids: ids, animation: getComputedStyle(el).animationName })
    }
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes' && r.target instanceof Element && r.target.hasAttribute('data-leaving')) note(r.target)
        for (const n of r.addedNodes) {
          if (!(n instanceof Element)) continue
          if (n.hasAttribute('data-leaving')) note(n)
          n.querySelectorAll('[data-leaving]').forEach(note)
        }
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-leaving'] })
  })
}

export const departures = (page: Page): Promise<Departure[]> =>
  page.evaluate(() => (window as unknown as { __departures: Departure[] }).__departures)
