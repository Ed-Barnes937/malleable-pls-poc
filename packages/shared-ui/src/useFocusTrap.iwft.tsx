import { test, expect } from '@playwright/experimental-ct-react'
import { FocusTrapHarness } from './FocusTrapHarness'

test('Tab wraps from the last control to the first, Shift+Tab from the first to the last', async ({ mount, page }) => {
  await mount(<FocusTrapHarness />)
  const trap = page.getByRole('dialog', { name: 'trap' })
  await trap.getByRole('button', { name: 'close' }).focus()
  await page.keyboard.press('Tab')
  await expect(trap.getByRole('button', { name: 'one' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(trap.getByRole('button', { name: 'close' })).toBeFocused()
  // Between the ends it is the browser's own order.
  await page.keyboard.press('Shift+Tab')
  await expect(trap.getByRole('button', { name: 'three' })).toBeFocused()
})

test('focus that lands outside is pulled back in, and Tab from outside enters at the ends', async ({ mount, page }) => {
  await mount(<FocusTrapHarness />)
  const trap = page.getByRole('dialog', { name: 'trap' })
  await page.getByRole('button', { name: 'before' }).focus()
  await expect(trap.getByRole('button', { name: 'one' })).toBeFocused()
  await page.getByRole('button', { name: 'after' }).click()
  await expect(trap.getByRole('button', { name: 'one' })).toBeFocused()
  // Blur to the page, then Shift+Tab from nowhere lands on the last control.
  await page.evaluate(() => (document.activeElement as HTMLElement).blur())
  await page.keyboard.press('Shift+Tab')
  await expect(trap.getByRole('button', { name: 'close' })).toBeFocused()
})

test('a stacked [aria-modal="true"] element keeps its own focus and Tab', async ({ mount, page }) => {
  await mount(<FocusTrapHarness withInner />)
  const inner = page.getByRole('dialog', { name: 'inner' })
  // Focus moving into the inner modal is not pulled back to the outer trap.
  await inner.getByRole('button', { name: 'inner one' }).focus()
  await expect(inner.getByRole('button', { name: 'inner one' })).toBeFocused()
  // Tab inside it is the inner trap's business: it wraps within the inner modal.
  await page.keyboard.press('Tab')
  await expect(inner.getByRole('button', { name: 'inner two' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(inner.getByRole('button', { name: 'inner one' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(inner.getByRole('button', { name: 'inner two' })).toBeFocused()
})

test('once it closes the trap lets go: focus and Tab are free', async ({ mount, page }) => {
  await mount(<FocusTrapHarness />)
  await page.getByRole('dialog', { name: 'trap' }).getByRole('button', { name: 'close' }).click()
  await expect(page.getByRole('dialog', { name: 'trap' })).toHaveCount(0)
  await page.getByRole('button', { name: 'before' }).focus()
  await expect(page.getByRole('button', { name: 'before' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'after' })).toBeFocused()
  await page.getByRole('button', { name: 'after' }).click()
  await expect(page.getByRole('button', { name: 'after' })).toBeFocused()
})
