import { test, expect } from '@playwright/experimental-ct-react'
import { LayersInDialog, Overlays } from './overlay-harness'
import { THEMES, setTheme } from './ct-themes'

for (const theme of THEMES) {
  test(`each overlay renders from our tokens in the ${theme.name} theme`, async ({ mount, page }) => {
    await setTheme(page, theme.name)
    await mount(<Overlays />)

    await page.getByRole('button', { name: 'Details' }).click()
    const popover = page.getByRole('dialog', { name: 'Maths study' })
    await expect(popover).toHaveCSS('background-color', theme.surfaceRaised)
    await expect(popover).toHaveCSS('color', theme.textPrimary)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Board menu' }).click()
    const menu = page.getByRole('menu')
    await expect(menu).toHaveCSS('background-color', theme.surfaceRaised)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Activity' }).click()
    const drawer = page.getByRole('dialog', { name: 'Activity' })
    await expect(drawer).toHaveCSS('background-color', theme.surfaceRaised)
    // A right-hand panel, full height, 320px wide, against the right edge.
    const box = (await drawer.boundingBox())!
    const viewport = page.viewportSize()!
    expect(Math.round(box.width)).toBe(320)
    expect(Math.round(box.height)).toBe(viewport.height)
    await expect.poll(async () => Math.round((await drawer.boundingBox())!.x + 320)).toBe(viewport.width)
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()

    await page.getByRole('button', { name: 'Add to calendar' }).hover()
    const tip = page.getByRole('tooltip')
    await expect(tip).toBeVisible()
    await expect(tip).toHaveCSS('background-color', theme.inverse)

    await page.getByRole('button', { name: 'Delete board' }).click()
    const alert = page.getByRole('alertdialog', { name: 'Delete board?' })
    await expect(alert).toHaveCSS('background-color', theme.surfaceRaised)
  })
}

test('Popover by keyboard: Enter opens it with focus inside, Escape closes it back to the trigger', async ({ mount, page }) => {
  await mount(<Overlays />)
  const trigger = page.getByRole('button', { name: 'Details' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const popover = page.getByRole('dialog', { name: 'Maths study' })
  await expect(popover.getByRole('button', { name: 'Edit' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('Menu by keyboard: arrows move, Enter runs the item and focus goes back', async ({ mount, page }) => {
  const events: string[] = []
  await mount(<Overlays onEvent={(e) => events.push(e)} />)
  const trigger = page.getByRole('button', { name: 'Board menu' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Duplicate' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()
  expect(events).toEqual(['menu:delete'])
})

test('Drawer by keyboard: Enter opens it, Tab stays inside, Escape closes it back to the trigger', async ({ mount, page }) => {
  await mount(<Overlays />)
  const trigger = page.getByRole('button', { name: 'Activity' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const drawer = page.getByRole('dialog', { name: 'Activity' })
  const close = drawer.getByRole('button', { name: 'Close' })
  await expect(close).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('Tooltip shows on keyboard focus and Escape hides it', async ({ mount, page }) => {
  await mount(<Overlays />)
  await page.getByRole('button', { name: 'Delete board' }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Add to calendar' })).toBeFocused()
  const tip = page.getByRole('tooltip')
  await expect(tip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tip).toBeHidden()
  await expect(page.getByRole('button', { name: 'Add to calendar' })).toBeFocused()
})

test('AlertDialog: focus starts on Cancel, a press outside does nothing, Escape cancels', async ({ mount, page }) => {
  const events: string[] = []
  await mount(<Overlays onEvent={(e) => events.push(e)} />)
  await page.getByRole('button', { name: 'Delete board' }).click()
  const alert = page.getByRole('alertdialog', { name: 'Delete board?' })
  await expect(alert.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await page.mouse.click(10, 10)
  await expect(alert).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(alert).toBeHidden()

  await page.getByRole('button', { name: 'Delete board' }).click()
  await page.keyboard.press('Tab')
  await expect(alert.getByRole('button', { name: 'Delete board' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(alert).toBeHidden()
  expect(events).toEqual(['alert:confirmed'])
})

test('useConfirm by keyboard: Enter on Cancel answers no, Tab then Enter answers yes', async ({ mount, page }) => {
  const events: string[] = []
  await mount(<Overlays onEvent={(e) => events.push(e)} />)
  const ask = page.getByRole('button', { name: 'Delete block' })
  await ask.focus()
  await page.keyboard.press('Enter')
  const alert = page.getByRole('alertdialog', { name: 'Delete it?' })
  await expect(alert.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(alert).toBeHidden()
  await expect(ask).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(alert).toBeHidden()
  expect(events).toEqual(['confirm:false', 'confirm:true'])
})

for (const inner of ['popover', 'menu'] as const) {
  test(`Escape closes a ${inner} inside a dialog before the dialog`, async ({ mount, page }) => {
    await mount(<LayersInDialog />)
    await page.getByRole('button', { name: 'New automation' }).click()
    const dialog = page.getByRole('dialog', { name: 'New automation' })
    const trigger = dialog.getByRole('button', { name: inner === 'popover' ? 'Help' : 'When' })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const layer = inner === 'popover' ? page.getByRole('dialog', { name: 'About automations' }) : page.getByRole('menu')
    await expect(layer).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(layer).toBeHidden()
    await expect(dialog).toBeVisible()
    await expect(trigger).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
}
