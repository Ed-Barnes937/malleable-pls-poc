import { test, expect } from '../../../playwright/fixtures'
import { ShellProviders } from '../../../playwright/mount-wrapper'
import { LensAutomationsButton } from './LensAutomationsButton'

test('by keyboard: Enter opens the widget Automations dialog, Escape closes it back to the button', async ({ mount, page, simulator }) => {
  await mount(
    <ShellProviders>
      <LensAutomationsButton panelId="p1" lensType="transcript" workspaceId={simulator.db.workspaces[0]!.id} />
    </ShellProviders>,
  )
  const button = page.getByRole('button', { name: 'Automations for Transcript' })
  await button.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Automations · Transcript' })
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(button).toBeFocused()
})
