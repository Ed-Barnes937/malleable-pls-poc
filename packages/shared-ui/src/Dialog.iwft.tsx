import { test, expect } from '@playwright/experimental-ct-react'
import type { Locator, Page } from '@playwright/test'
import { DialogBesidePage, DialogFromPopover, StackedDialogs } from './overlay-harness'
import { THEMES, setTheme, tokenColor } from './ct-themes'

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

test('Escape on a dialog opened from a popover closes only the dialog, and focus goes back to its opener', async ({ mount, page }) => {
  await mount(<DialogFromPopover />)
  await page.getByRole('button', { name: 'Open popover' }).click()
  const popover = page.getByRole('dialog', { name: 'Block' })
  const edit = popover.getByRole('button', { name: 'Edit automation' })
  await edit.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Automation' })
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(popover).toBeVisible()
  await expect(edit).toBeFocused()
})

for (const theme of THEMES) {
  test(`renders from our tokens in the ${theme} theme`, async ({ mount, page }) => {
    await setTheme(page, theme)
    await mount(<StackedDialogs />)
    await page.getByRole('button', { name: 'Automations' }).click()
    const dialog = page.getByRole('dialog', { name: 'Automations' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveCSS('background-color', await tokenColor(page, '--color-surface-raised'))
    await expect(dialog).toHaveCSS('color', await tokenColor(page, '--color-text-primary'))
    await expect(dialog).toHaveCSS('border-radius', '20px')
    // Centred in the viewport.
    const box = await boxOf(dialog)
    const viewport = page.viewportSize()!
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2)
    expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2)
  })
}

test('Escape closes only the topmost of two dialogs, and focus goes back each time', async ({ mount, page }) => {
  await mount(<StackedDialogs />)
  const opener = page.getByRole('button', { name: 'Automations' })
  await opener.focus()
  await page.keyboard.press('Enter')
  const first = page.getByRole('dialog', { name: 'Automations' })
  await expect(first).toBeVisible()

  const edit = first.getByRole('button', { name: 'Edit' })
  await edit.focus()
  await page.keyboard.press('Enter')
  const second = page.getByRole('dialog', { name: 'Edit automation' })
  await expect(second.getByRole('button', { name: 'Close' })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(second).toBeHidden()
  await expect(first).toBeVisible()
  await expect(edit).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(first).toBeHidden()
  await expect(opener).toBeFocused()
})

test('Tab and Shift+Tab stay inside the dialog', async ({ mount, page }) => {
  await mount(<StackedDialogs />)
  await page.getByRole('button', { name: 'Automations' }).click()
  const dialog = page.getByRole('dialog', { name: 'Automations' })
  const close = dialog.getByRole('button', { name: 'Close' })
  const del = dialog.getByRole('button', { name: 'Delete' })
  await expect(close).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Edit' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(del).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(del).toBeFocused()
})

test('a press on the backdrop closes it', async ({ mount, page }) => {
  await mount(<StackedDialogs />)
  await page.getByRole('button', { name: 'Automations' }).click()
  const dialog = page.getByRole('dialog', { name: 'Automations' })
  await expect(dialog).toBeVisible()
  await page.mouse.click(10, 10)
  await expect(dialog).toBeHidden()
})

test('the page takes a press as soon as the dialog closes', async ({ mount, page }) => {
  await mount(<DialogBesidePage />)
  await page.getByRole('button', { name: 'New board' }).click()
  const dialog = page.getByRole('dialog', { name: 'New board' })
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
  const pressed = await boxOf(page.getByRole('button', { name: 'Pressed 0' }))
  await page.keyboard.press('Escape')
  // At once, as a quick hand would, while it fades out: the closing dialog doesn't eat the press.
  await page.mouse.click(pressed.x + pressed.width / 2, pressed.y + pressed.height / 2)
  await expect(page.getByRole('button', { name: 'Pressed 1' })).toBeVisible()
  await expect(dialog).toBeHidden()
})
