import { test, expect } from '../../../playwright/fixtures'
import { ShellProviders } from '../../../playwright/mount-wrapper'
import { DrawerSidebar } from './DrawerSidebar'
import { BoardMenuHarness } from './shell-overlay-harness'

// The palette adds to the open board, so these run against the backend
// simulator's boards (its first board opens).
test('groups widgets by what a student wants to do', async ({ mount, page, simulator: _boards }) => {
  await mount(
    <ShellProviders>
      <DrawerSidebar open onClose={() => {}} onAddWidget={() => {}} />
    </ShellProviders>,
  )

  const groups = page.getByTestId('widget-palette').getByRole('group')
  await expect(groups).toHaveText([/^Capture/, /^Study/, /^Plan/, /^Review/])
  await expect(page.getByRole('group', { name: 'Plan' }).getByRole('button', { name: 'Add To-do' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Plan' }).getByRole('button', { name: 'Add Coming up' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Capture' }).getByRole('button')).toHaveText(['Audio CaptureRecord or upload a lecture'])
  await expect(page.getByRole('group', { name: 'Study' }).getByRole('button', { name: 'Add Transcript' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Review' }).getByRole('button', { name: 'Add Weakest Topics' })).toBeVisible()
})

test('clicking a widget adds it and keeps the drawer open', async ({ mount, page, simulator: _boards }) => {
  const added: string[] = []
  let closed = false
  await mount(
    <ShellProviders>
      <DrawerSidebar open onClose={() => { closed = true }} onAddWidget={(type) => { added.push(type) }} />
    </ShellProviders>,
  )

  await page.getByRole('button', { name: 'Add Transcript', exact: true }).click()
  await page.getByRole('button', { name: 'Add Weakest Topics', exact: true }).click()
  await page.getByRole('button', { name: 'Add All Courses', exact: true }).click()

  await expect.poll(() => added).toEqual(['transcript', 'weakest-topics', 'gap-analysis'])
  expect(closed).toBe(false)
  await expect(page.getByTestId('drawer-sidebar')).toBeVisible()
})

test('a closed drawer is hidden from assistive tech and keyboard', async ({ mount, page }) => {
  await mount(
    <ShellProviders>
      <DrawerSidebar open={false} onClose={() => {}} onAddWidget={() => {}} />
    </ShellProviders>,
  )
  await expect(page.getByRole('button', { name: 'Add Transcript' })).toHaveCount(0)
})

test('with no board, offers no widgets and says a board comes first', async ({ mount, page, simulator }) => {
  simulator.db.workspaces.splice(0)
  await mount(
    <ShellProviders>
      <DrawerSidebar open onClose={() => {}} onAddWidget={() => {}} />
    </ShellProviders>,
  )
  await expect(page.getByTestId('drawer-no-board')).toHaveText('Make a board first, then you can add widgets to it.')
  await expect(page.getByTestId('widget-palette')).toHaveCount(0)
  await expect(page.getByTestId('scope-section')).toHaveCount(0)
  await expect(page.getByText('Automations')).toHaveCount(0)
})

test('by keyboard: Enter opens the menu on its sheet, Tab stays inside, Escape closes it back to the opener', async ({ mount, page, simulator: _boards }) => {
  await mount(
    <ShellProviders>
      <BoardMenuHarness />
    </ShellProviders>,
  )
  const opener = page.getByRole('button', { name: 'Open board menu' })
  await opener.focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('dialog', { name: 'Board menu' })
  await expect(menu).toBeFocused()
  await expect(menu).toHaveAttribute('aria-modal', 'true')

  await page.keyboard.press('Tab')
  await expect(menu.getByRole('button', { name: 'Close board menu' })).toBeFocused()
  for (const key of ['Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Tab', 'Tab']) {
    await page.keyboard.press(key)
    expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  }

  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(opener).toBeFocused()
})

test('Close button and a press on the page beside the menu both close it', async ({ mount, page, simulator: _boards }) => {
  await mount(
    <ShellProviders>
      <BoardMenuHarness />
    </ShellProviders>,
  )
  const opener = page.getByRole('button', { name: 'Open board menu' })
  const menu = page.getByRole('dialog', { name: 'Board menu' })
  await opener.click()
  await expect(menu).toBeVisible()
  await menu.getByRole('button', { name: 'Close board menu' }).click()
  await expect(menu).toBeHidden()
  await expect(opener).toBeFocused()

  await opener.click()
  await expect(menu).toBeVisible()
  const viewport = page.viewportSize()!
  await page.mouse.click(viewport.width - 20, viewport.height / 2)
  await expect(menu).toBeHidden()
})

test('on a phone Activity opens over the menu: Escape closes Activity alone, then the menu', async ({ mount, page, simulator: _boards }) => {
  await page.setViewportSize({ width: 400, height: 800 })
  await mount(
    <ShellProviders>
      <BoardMenuHarness />
    </ShellProviders>,
  )
  await page.getByRole('button', { name: 'Open board menu' }).click()
  const menu = page.getByRole('dialog', { name: 'Board menu' })
  const activityButton = menu.getByTestId('activity-button')
  await activityButton.focus()
  await page.keyboard.press('Enter')
  const activity = page.getByRole('dialog', { name: 'Activity' })
  await expect(activity.getByRole('button', { name: 'Close activity' })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(activity).toBeHidden()
  await expect(menu).toBeVisible()
  await expect(activityButton).toBeFocused()

  // A press on the menu's visible edge, past Activity's backdrop, closes Activity and reaches nothing in the menu.
  await activityButton.click()
  await expect(activity).toBeVisible()
  await page.mouse.click(20, 400)
  await expect(activity).toBeHidden()
  await expect(menu).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
})

test('the page takes a press, and the menu reopens, the moment it is closed', async ({ mount, page, simulator: _boards }) => {
  await mount(
    <ShellProviders>
      <BoardMenuHarness />
    </ShellProviders>,
  )
  const opener = page.getByRole('button', { name: 'Open board menu' })
  const menu = page.getByRole('dialog', { name: 'Board menu' })
  await opener.click()
  await expect(menu).toBeVisible()
  const pressed = (await page.getByRole('button', { name: /^Pressed/ }).boundingBox())!

  // At once, while it slides away: nothing left behind eats the press.
  await page.keyboard.press('Escape')
  await page.mouse.click(pressed.x + pressed.width / 2, pressed.y + pressed.height / 2)
  await expect(page.getByRole('button', { name: 'Pressed 1' })).toBeVisible()

  // And it opens again straight away, staying open.
  await page.keyboard.press('Escape')
  await opener.click()
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Close board menu' })).toBeVisible()
  await page.waitForTimeout(600)
  await expect(menu).toBeVisible()
})
