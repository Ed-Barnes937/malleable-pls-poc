import { test, expect } from '@playwright/experimental-ct-react'
import type { Page } from '@playwright/test'
import { FormControlsHarness } from './FormControlsHarness'

const state = async (page: Page) => JSON.parse((await page.getByTestId('state').textContent()) ?? '{}')
const setTheme = (page: Page, theme: 'light' | 'dark') =>
  page.evaluate((t: string) => document.documentElement.setAttribute('data-theme', t), theme)

for (const theme of ['light', 'dark'] as const) {
  test(`every control renders and is operable in ${theme}`, async ({ mount, page }) => {
    await mount(<FormControlsHarness />)
    await setTheme(page, theme)
    for (const el of [
      page.getByRole('switch', { name: 'Enabled' }),
      page.getByRole('checkbox', { name: 'Repeat weekly' }),
      page.getByRole('radiogroup', { name: 'Kind' }),
      page.getByRole('tablist', { name: 'View' }),
      page.getByRole('group', { name: 'Starts' }),
      page.getByRole('textbox', { name: 'Date' }),
    ]) await expect(el).toBeVisible()
    // The checked switch and checkbox are filled from the accent token.
    const accent = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.className = 'bg-accent'
      document.body.append(probe)
      const c = getComputedStyle(probe).backgroundColor
      probe.remove()
      return c
    })
    await expect(page.getByRole('switch', { name: 'Enabled' })).toHaveCSS('background-color', accent)
    await expect(page.getByRole('checkbox', { name: 'Repeat weekly' })).toHaveCSS('background-color', accent)
  })
}

test('the accent differs between light and dark, so the controls follow the theme', async ({ mount, page }) => {
  await mount(<FormControlsHarness />)
  const sw = page.getByRole('switch', { name: 'Enabled' })
  await setTheme(page, 'light')
  await expect(sw).toHaveCSS('background-color', 'rgb(61, 95, 214)')
  await setTheme(page, 'dark')
  await expect(sw).toHaveCSS('background-color', 'rgb(147, 169, 255)')
})

test('Switch and Checkbox toggle with Space', async ({ mount, page }) => {
  await mount(<FormControlsHarness />)
  await page.getByRole('switch', { name: 'Enabled' }).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Space')
  expect(await state(page)).toMatchObject({ on: false, tick: false })
})

test('SegmentedControl: arrows move the choice and the checked item shows the indicator', async ({ mount, page }) => {
  await mount(<FormControlsHarness />)
  await page.getByRole('radio', { name: 'Study' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Task' })).toBeChecked()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('radio', { name: 'Event' })).toBeChecked()
  expect((await state(page)).kind).toBe('event')
  await expect.poll(async () => {
    const item = await page.getByRole('radio', { name: 'Event' }).boundingBox()
    const indicator = await page.locator('[data-slot="segmented-control-indicator"]').boundingBox()
    return Math.abs((indicator?.x ?? -99) - (item?.x ?? 0))
  }).toBeLessThan(4)
})

test('Tabs: arrows move and show the matching panel', async ({ mount, page }) => {
  await mount(<FormControlsHarness />)
  await page.getByRole('tab', { name: 'Day' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Week' })).toBeFocused()
  await expect(page.getByText('Week panel')).toBeVisible()
  await expect(page.getByText('Day panel')).toBeHidden()
})

test('TimeInput: stepping by 15 and typing', async ({ mount, page }) => {
  await mount(<FormControlsHarness />)
  await page.getByRole('spinbutton', { name: 'minute' }).focus()
  await page.keyboard.press('ArrowUp')
  expect((await state(page)).time).toBe('09:45')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  expect((await state(page)).time).toBe('09:15')
  await page.getByRole('spinbutton', { name: 'hour' }).focus()
  await page.keyboard.type('2230')
  expect((await state(page)).time).toBe('22:30')
})

test('DatePicker: open the calendar from the keyboard, pick a day, focus returns', async ({ mount, page }) => {
  await mount(<FormControlsHarness />)
  const trigger = page.getByRole('button', { name: /from calendar/i })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const calendar = page.getByRole('dialog', { name: 'Date calendar' })
  await expect(calendar).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(calendar).toBeHidden()
  expect((await state(page)).date).toBe('2026-12-03')
  await expect(trigger).toBeFocused()
})

test('DatePicker: Alt+ArrowDown opens, Escape closes, typing a date commits on Enter', async ({ mount, page }) => {
  await mount(<FormControlsHarness />)
  const input = page.getByRole('textbox', { name: 'Date' })
  await input.focus()
  await page.keyboard.press('Alt+ArrowDown')
  const calendar = page.getByRole('dialog', { name: 'Date calendar' })
  await expect(calendar).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(calendar).toBeHidden()
  await input.fill('2026-12-24')
  await input.press('Enter')
  expect((await state(page)).date).toBe('2026-12-24')
})
