import type { Locator } from '@playwright/test'

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
