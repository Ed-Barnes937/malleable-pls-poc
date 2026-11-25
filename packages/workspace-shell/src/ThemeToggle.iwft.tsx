import { test, expect } from '@playwright/experimental-ct-react'
import { ThemeToggle } from './ThemeToggle'

test('renders toggle button', async ({ mount, page }) => {
  await mount(<ThemeToggle />)
  await expect(page.getByRole('button')).toBeVisible()
})

test('starts in light mode when no theme is stored', async ({ mount, page }) => {
  await mount(<ThemeToggle />)
  await expect(page.getByTitle('Switch to dark mode')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('toggles to dark mode on click and remembers it', async ({ mount, page }) => {
  await mount(<ThemeToggle />)
  await page.getByRole('button').click()
  await expect(page.getByTitle('Switch to light mode')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => localStorage.getItem('pls-theme'))).toBe('dark')
})

test('toggles back to light mode on second click', async ({ mount, page }) => {
  await mount(<ThemeToggle />)
  await page.getByRole('button').click()
  await page.getByRole('button').click()
  await expect(page.getByTitle('Switch to dark mode')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('keeps a stored dark choice', async ({ mount, page }) => {
  await page.evaluate(() => localStorage.setItem('pls-theme', 'dark'))
  await mount(<ThemeToggle />)
  await expect(page.getByTitle('Switch to light mode')).toBeVisible()
})

test('follows the OS scheme when the stored choice is "system"', async ({ mount, page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.evaluate(() => localStorage.setItem('pls-theme', 'system'))
  await mount(<ThemeToggle />)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByTitle('Switch to light mode')).toBeVisible()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByTitle('Switch to dark mode')).toBeVisible()
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
  await expect(page.getByTitle('Switch to light mode')).toBeVisible()
  await other.close()
})

test('clicking in system mode picks the opposite of what shows', async ({ mount, page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.evaluate(() => localStorage.setItem('pls-theme', 'system'))
  await mount(<ThemeToggle />)
  await page.getByRole('button').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => localStorage.getItem('pls-theme'))).toBe('light')
})
