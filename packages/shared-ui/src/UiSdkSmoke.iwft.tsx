import { test, expect } from '../../../playwright/fixtures'
import { UiSdkSmoke } from './UiSdkSmoke'

test('a UI SDK Popover opens and closes in a real browser (Playwright CT)', async ({ mount, page }) => {
  await mount(<UiSdkSmoke />)
  const dialog = page.getByRole('dialog', { name: 'Smoke popover' })
  await expect(dialog).toBeHidden()

  await page.getByRole('button', { name: 'Smoke trigger' }).click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Smoke body')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
