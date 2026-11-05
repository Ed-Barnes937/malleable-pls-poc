import type { Page } from '@playwright/test'

/**
 * Waits until the fonts the page has started loading have arrived (or
 * failed). The app's fonts (apps/web/src/fonts) use `font-display: swap`:
 * text is drawn in a fallback font until its face arrives, then redrawn a
 * fraction of a pixel wider or narrower (a right-aligned "Save" button's
 * left edge shifted 0.66px when DM Sans came late from Google Fonts). The
 * first screen's face is preloaded from the app itself, so it normally lands
 * first, but a face fetched only when text first needs it (italic, Latin
 * Extended) or a slow load can still land in the middle of a test checking
 * that something keeps still: call this after what is measured has rendered
 * and before the first measurement.
 */
export async function untilFontsLoaded(page: Page) {
  await page.evaluate(async () => { await document.fonts.ready })
}
