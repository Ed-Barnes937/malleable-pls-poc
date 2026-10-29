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
