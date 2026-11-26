import { test, expect } from '@playwright/experimental-ct-react'
import type { Page } from '@playwright/test'
import { FormControlsHarness } from './FormControlsHarness'

const state = async (page: Page) => JSON.parse((await page.getByTestId('state').textContent()) ?? '{}')
const setTheme = (page: Page, theme: 'light' | 'dark') =>
  page.evaluate((t: string) => document.documentElement.setAttribute('data-theme', t), theme)

/** The computed value of `prop` on a throwaway element carrying the token classes, in the current theme. */
const token = (page: Page, className: string, prop: 'backgroundColor' | 'color' | 'borderTopColor') =>
  page.evaluate(
    ([cls, p]) => {
      const probe = document.createElement('div')
      probe.className = `border-2 ${cls}`
      document.body.append(probe)
      const value = getComputedStyle(probe)[p as 'backgroundColor']
      probe.remove()
      return value
    },
    [className, prop] as const,
  )

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
    const accent = await token(page, 'bg-accent', 'backgroundColor')
    await expect(page.getByRole('switch', { name: 'Enabled' })).toHaveCSS('background-color', accent)
    await expect(page.getByRole('checkbox', { name: 'Repeat weekly' })).toHaveCSS('background-color', accent)
    // SegmentedControl: track, sliding indicator and checked text follow the theme.
    await expect(page.getByRole('radiogroup', { name: 'Kind' })).toHaveCSS('background-color', await token(page, 'bg-surface-overlay', 'backgroundColor'))
    await expect(page.locator('[data-slot="segmented-control-indicator"]')).toHaveCSS('background-color', await token(page, 'bg-surface-raised', 'backgroundColor'))
    await expect(page.getByRole('radio', { name: 'Study' })).toHaveCSS('color', await token(page, 'text-text-primary', 'color'))
    // Tabs: the selected tab carries the accent underline.
    await expect(page.getByRole('tab', { name: 'Day' })).toHaveCSS('border-bottom-color', accent)
    // TimeInput and the date field are raised surfaces.
    const raised = await token(page, 'bg-surface-raised', 'backgroundColor')
    await expect(page.getByRole('group', { name: 'Starts' })).toHaveCSS('background-color', raised)
    await expect(page.getByRole('textbox', { name: 'Date' })).toHaveCSS('background-color', raised)
  })

  test(`the DatePicker calendar follows the theme in ${theme}`, async ({ mount, page }) => {
    await mount(<FormControlsHarness />)
    await setTheme(page, theme)
    await page.getByRole('button', { name: /from calendar/i }).click()
    const calendar = page.getByRole('dialog', { name: 'Date calendar' })
    await expect(calendar).toBeVisible()
    await expect(calendar).toHaveCSS('background-color', await token(page, 'bg-surface-raised', 'backgroundColor'))
    await expect(calendar).toHaveCSS('color', await token(page, 'text-text-primary', 'color'))
    const selected = calendar.locator('[data-selected]').first()
    await expect(selected).toHaveCSS('background-color', await token(page, 'bg-accent', 'backgroundColor'))
    await expect(selected).toHaveCSS('color', await token(page, 'text-accent-foreground', 'color'))
  })
}

test('the accent differs between light and dark, so the controls follow the theme', async ({ mount, page }) => {
  await mount(<FormControlsHarness />)
  const sw = page.getByRole('switch', { name: 'Enabled' })
  await setTheme(page, 'light')
  const light = await token(page, 'bg-accent', 'backgroundColor')
  await expect(sw).toHaveCSS('background-color', light)
  await setTheme(page, 'dark')
  const dark = await token(page, 'bg-accent', 'backgroundColor')
  expect(dark).not.toBe(light)
  await expect(sw).toHaveCSS('background-color', dark)
})

test('TimeInput with w-full fills its container', async ({ mount, page }) => {
  await mount(<FormControlsHarness />)
  const container = await page.getByTestId('wide-time').boundingBox()
  const group = await page.getByRole('group', { name: 'Wide start' }).boundingBox()
  expect(container).not.toBeNull()
  expect(group?.width).toBeCloseTo(container?.width ?? -1, 0)
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
  await page.getByRole('group', { name: 'Starts' }).getByRole('spinbutton', { name: 'minute' }).focus()
  await page.keyboard.press('ArrowUp')
  expect((await state(page)).time).toBe('09:45')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  expect((await state(page)).time).toBe('09:15')
  await page.getByRole('group', { name: 'Starts' }).getByRole('spinbutton', { name: 'hour' }).focus()
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

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 400]) {
    test(`TimeInput reads as one HH:MM, no gap, in ${theme} at ${width}`, async ({ mount, page }) => {
      await page.setViewportSize({ width, height: 800 })
      await mount(<FormControlsHarness />)
      await setTheme(page, theme)
      const group = page.getByRole('group', { name: 'Starts' })
      await group.screenshot({ path: `${process.env.TI_SHOTS ?? 'test-results/ct'}/time-${theme}-${width}.png` })
      // Each segment's box is no wider than its two digits, so "09" meets ":" meets "30".
      const slack = await group.evaluate((g) =>
        [...g.querySelectorAll<HTMLInputElement>('input[role="spinbutton"]')].map((input) => {
          const ctx = document.createElement('canvas').getContext('2d')!
          ctx.font = getComputedStyle(input).font
          return input.getBoundingClientRect().width - ctx.measureText(input.value).width
        }),
      )
      for (const s of slack) expect(s).toBeLessThan(2)
    })
  }
}
