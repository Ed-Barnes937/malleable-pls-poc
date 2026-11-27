import { test, expect } from '../../../playwright/fixtures'
import { ShellProviders } from '../../../playwright/mount-wrapper'
import { TopBar } from './TopBar'

test('board appearance: Enter on the gear opens the picker, Escape closes it back to the gear', async ({ mount, page, simulator: _boards }) => {
  await mount(
    <ShellProviders>
      <TopBar onMenuClick={() => {}} boardHasCalendar={false} onPlanWeek={() => {}} onAddCalendar={() => {}} />
    </ShellProviders>,
  )
  const gear = page.getByRole('button', { name: 'Board appearance' })
  await gear.focus()
  await page.keyboard.press('Enter')
  const popover = page.getByTestId('settings-popover')
  await expect(popover).toBeVisible()
  await expect(popover.getByTestId('background-picker')).toContainText('Background')
  await expect(popover).toHaveAccessibleName('Board appearance')

  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(gear).toBeFocused()
})

test('board appearance: a press elsewhere closes it, and choosing a background keeps it open', async ({ mount, page, simulator: _boards }) => {
  await mount(
    <ShellProviders>
      <TopBar onMenuClick={() => {}} boardHasCalendar={false} onPlanWeek={() => {}} onAddCalendar={() => {}} />
    </ShellProviders>,
  )
  await page.getByRole('button', { name: 'Board appearance' }).click()
  const popover = page.getByTestId('settings-popover')
  await popover.getByRole('button', { name: 'Sage' }).click()
  await expect(popover).toBeVisible()
  await page.mouse.click(5, 400)
  await expect(popover).toBeHidden()
})
