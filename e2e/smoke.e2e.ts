import { test, expect } from '@playwright/test'

test('app loads and shows the workspace shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('top-bar')).toBeVisible()
  await expect(page.getByTestId('canvas-container')).toBeVisible()
})
