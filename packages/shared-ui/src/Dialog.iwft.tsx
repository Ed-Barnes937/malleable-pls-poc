import { test, expect, type Locator, type Page } from '@playwright/experimental-ct-react'
import { DialogFromPopover } from './overlay-harness'

/** The name of the dialog painted at the centre of `box`, or null. */
async function topmostAt(page: Page, box: { x: number; y: number; width: number; height: number }) {
  return page.evaluate(({ x, y }) => {
    const dialog = document.elementFromPoint(x, y)?.closest('[role="dialog"]')
    if (!dialog) return null
    const labelledBy = dialog.getAttribute('aria-labelledby')
    return labelledBy ? document.getElementById(labelledBy)?.textContent ?? null : dialog.getAttribute('aria-label')
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('not visible')
  return box
}

test('a dialog opened from a popover stacks above it', async ({ mount, page }) => {
  await mount(<DialogFromPopover />)
  await page.getByRole('button', { name: 'Open popover' }).click()
  const popover = page.getByRole('dialog', { name: 'Block' })
  await expect(popover).toBeVisible()
  await popover.getByRole('button', { name: 'Edit automation' }).click()

  const dialog = page.getByRole('dialog', { name: 'Automation' })
  await expect(dialog).toBeVisible()
  await expect(popover).toBeVisible()

  // The two overlap, and where they do, the dialog is on top.
  const popoverBox = await boxOf(popover)
  const dialogBox = await boxOf(dialog)
  const cx = popoverBox.x + popoverBox.width / 2
  const cy = popoverBox.y + popoverBox.height / 2
  expect(cx > dialogBox.x && cx < dialogBox.x + dialogBox.width && cy > dialogBox.y && cy < dialogBox.y + dialogBox.height).toBe(true)
  expect(await topmostAt(page, popoverBox)).toBe('Automation')

  // Its close button takes the press (nothing covers it).
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
  await expect(popover).toBeVisible()
})
