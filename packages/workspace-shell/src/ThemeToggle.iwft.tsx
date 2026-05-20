import { test, expect } from '@playwright/experimental-ct-react'
import { ThemeToggle } from './ThemeToggle'

test('renders toggle button', async ({ mount, page }) => {
  await mount(<ThemeToggle />)
  await expect(page.getByRole('button')).toBeVisible()
})

test('shows switch-to-light title when in dark mode', async ({ mount, page }) => {
  await mount(<ThemeToggle />)
  await expect(page.getByTitle('Switch to light mode')).toBeVisible()
})

test('toggles to light mode on click', async ({ mount, page }) => {
  await mount(<ThemeToggle />)
  await page.getByRole('button').click()
  await expect(page.getByTitle('Switch to dark mode')).toBeVisible()
})

test('toggles back to dark mode on second click', async ({ mount, page }) => {
  await mount(<ThemeToggle />)
  await page.getByRole('button').click()
  await page.getByRole('button').click()
  await expect(page.getByTitle('Switch to light mode')).toBeVisible()
})
