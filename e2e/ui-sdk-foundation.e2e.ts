import path from 'node:path'
import { test, expect } from '@playwright/test'

// K0a: a UI SDK popup renders and opens inside the real Vite app (its dev
// server, plugins and dependency pre-bundling), not only in CT's own Vite.
// The fixture is loaded through the app's module graph, so no product UI is needed.
const fixture = path.resolve(__dirname, '../packages/shared-ui/src/UiSdkSmoke.tsx')

test('a UI SDK Popover opens in the Vite web app', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async (file) => {
    const host = document.createElement('div')
    host.id = 'ui-sdk-smoke-host'
    document.body.append(host)
    const mod = await import(/* @vite-ignore */ `/@fs${file}`)
    mod.mountUiSdkSmoke(host)
  }, fixture)

  const dialog = page.getByRole('dialog', { name: 'Smoke popover' })
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'Smoke trigger' }).click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
