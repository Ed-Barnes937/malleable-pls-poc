import type { Page } from '@playwright/experimental-ct-react'

/** Both app themes with the computed colours of the tokens overlays use (index.css). */
export const THEMES = [
  { name: 'light', surfaceRaised: 'rgb(255, 252, 248)', textPrimary: 'rgb(43, 37, 32)', inverse: 'rgb(43, 37, 32)' },
  { name: 'dark', surfaceRaised: 'rgb(35, 31, 27)', textPrimary: 'rgb(242, 237, 230)', inverse: 'rgb(242, 237, 230)' },
] as const

/** Switches the theme the way ThemeToggle does. */
export async function setTheme(page: Page, name: 'light' | 'dark') {
  await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), name)
}
