import type { Page } from '@playwright/test'

/**
 * Waits until the fonts the page has started loading have arrived (or
 * failed). The app loads DM Sans from Google Fonts with `display=swap`, so
 * text is drawn in a fallback font first and redrawn when the web font
 * arrives, a fraction of a pixel wider or narrower (a right-aligned "Save"
 * button's left edge shifts 0.66px). On a loaded machine that redraw can land
 * in the middle of a test checking that something on screen keeps still:
 * call this after what is measured has rendered (a font starts loading when
 * text first needs it) and before the first measurement.
 */
export async function untilFontsLoaded(page: Page) {
  await page.evaluate(async () => { await document.fonts.ready })
}
