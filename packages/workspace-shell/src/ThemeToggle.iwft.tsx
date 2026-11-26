import { test, expect } from '@playwright/experimental-ct-react'
import { ThemeToggle } from './ThemeToggle'
import { tokenColor } from '../../shared-ui/src/ct-themes'

const trigger = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Theme' })
const choice = (page: import('@playwright/test').Page, name: string) => page.getByRole('menuitemradio', { name })

test('renders a Theme button that opens a Light / Dark / System menu', async ({ mount, page }) => {
  await mount(<ThemeToggle />)
  await expect(trigger(page)).toBeVisible()
  await trigger(page).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitemradio')).toHaveText(['Light', 'Dark', 'System'])
})

test('starts on System when nothing is stored, following the OS', async ({ mount, page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await mount(<ThemeToggle />)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await trigger(page).click()
  await expect(choice(page, 'System')).toBeChecked()
  // Merely showing it stores nothing.
  expect(await page.evaluate(() => localStorage.getItem('pls-theme'))).toBeNull()
})

test('choosing Dark draws dark, remembers it under pls-theme and closes the menu', async ({ mount, page }) => {
  await mount(<ThemeToggle />)
  await trigger(page).click()
  await choice(page, 'Dark').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => localStorage.getItem('pls-theme'))).toBe('dark')
  await expect(page.getByRole('menu')).toBeHidden()
  await trigger(page).click()
  await expect(choice(page, 'Dark')).toBeChecked()
  await expect(choice(page, 'System')).not.toBeChecked()
})

test('choosing Light, then System, each takes effect', async ({ mount, page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await mount(<ThemeToggle />)
  await trigger(page).click()
  await choice(page, 'Light').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => localStorage.getItem('pls-theme'))).toBe('light')
  await trigger(page).click()
  await choice(page, 'System').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => localStorage.getItem('pls-theme'))).toBe('system')
})

test('by keyboard: Enter opens it, arrows move, Enter picks, Escape closes back to the button', async ({ mount, page }) => {
  await mount(<ThemeToggle />)
  await trigger(page).focus()
  await page.keyboard.press('Enter')
  // Opens on the checked choice (System when nothing is stored).
  await expect(choice(page, 'System')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(choice(page, 'Light')).toBeFocused()
  await page.keyboard.press('End')
  await expect(choice(page, 'System')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(choice(page, 'Dark')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(trigger(page)).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(choice(page, 'Dark')).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(trigger(page)).toBeFocused()
  expect(await page.evaluate(() => localStorage.getItem('pls-theme'))).toBe('dark')
})

test('opens on the checked choice, as a radio menu does, and the arrows go on from there', async ({ mount, page }) => {
  await page.evaluate(() => localStorage.setItem('pls-theme', 'dark'))
  await mount(<ThemeToggle />)
  await trigger(page).focus()
  await page.keyboard.press('Enter')
  await expect(choice(page, 'Dark')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(choice(page, 'System')).toBeFocused()
  await page.keyboard.press('Escape')

  // Opened by a click too.
  await trigger(page).click()
  await expect(choice(page, 'Dark')).toBeFocused()
})

test('in dark, the focused choice has a clear accent outline, not only a faint fill', async ({ mount, page }) => {
  await page.evaluate(() => localStorage.setItem('pls-theme', 'dark'))
  await mount(<ThemeToggle />)
  await trigger(page).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('End')
  const focused = choice(page, 'System')
  await expect(focused).toBeFocused()
  await expect(focused).toHaveCSS('outline-style', 'solid')
  await expect(focused).toHaveCSS('outline-width', '2px')
  await expect(focused).toHaveCSS('outline-color', await tokenColor(page, '--color-accent'))
  // The others show no outline.
  await expect(choice(page, 'Dark')).toHaveCSS('outline-style', 'none')
})

test('keeps a stored dark choice', async ({ mount, page }) => {
  await page.evaluate(() => localStorage.setItem('pls-theme', 'dark'))
  await mount(<ThemeToggle />)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await trigger(page).click()
  await expect(choice(page, 'Dark')).toBeChecked()
})

test('follows the OS scheme when the stored choice is "system"', async ({ mount, page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.evaluate(() => localStorage.setItem('pls-theme', 'system'))
  await mount(<ThemeToggle />)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  // Following the OS is not overwritten by merely showing the toggle.
  expect(await page.evaluate(() => localStorage.getItem('pls-theme'))).toBe('system')
})

test('an explicit choice ignores the OS scheme', async ({ mount, page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.evaluate(() => localStorage.setItem('pls-theme', 'light'))
  await mount(<ThemeToggle />)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('a choice made in another tab shows here', async ({ mount, page }) => {
  await mount(<ThemeToggle />)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const other = await page.context().newPage()
  await other.goto(page.url())
  await other.evaluate(() => localStorage.setItem('pls-theme', 'dark'))
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await trigger(page).click()
  await expect(choice(page, 'Dark')).toBeChecked()
  await other.close()
})
