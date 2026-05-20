import { test, expect } from '@playwright/experimental-ct-react'
import { ProgressBar } from './ProgressBar'

test('renders inner bar with correct width', async ({ mount, page }) => {
  await mount(<ProgressBar value={75} />)
  const bar = page.locator('[style*="width: 75%"]')
  await expect(bar).toBeVisible()
})

test('defaults to md size', async ({ mount, page }) => {
  await mount(<ProgressBar value={50} />)
  await expect(page.locator('[class*="h-4"]')).toBeVisible()
})

test('sm size applies smaller height', async ({ mount, page }) => {
  await mount(<ProgressBar value={50} size="sm" />)
  await expect(page.locator('[class*="h-2.5"]')).toBeVisible()
})

test('rounded applies rounded-full', async ({ mount, page }) => {
  await mount(<ProgressBar value={50} rounded />)
  await expect(page.locator('[class*="rounded-full"]').first()).toBeVisible()
})

test('zero value renders bar with 0% width', async ({ mount, page }) => {
  await mount(<ProgressBar value={0} />)
  const bar = page.locator('[style*="width: 0%"]')
  await expect(bar).toBeAttached()
})
