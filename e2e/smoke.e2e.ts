import { test, expect } from '@playwright/test'

test('app loads and shows sidebar', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Malleable PLS')).toBeVisible()
})
