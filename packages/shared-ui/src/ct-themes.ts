import type { Page } from '@playwright/test'

/** Both app themes (index.css). */
export const THEMES = ['light', 'dark'] as const

/** Switches the theme the way the theme menu does. */
export async function setTheme(page: Page, name: (typeof THEMES)[number]) {
  await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), name)
}

/** The computed colour of a design token (e.g. `--color-surface-raised`) in the page's current theme. */
export async function tokenColor(page: Page, name: string) {
  return page.evaluate((token) => {
    const probe = document.createElement('div')
    probe.style.color = `var(${token})`
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, name)
}
