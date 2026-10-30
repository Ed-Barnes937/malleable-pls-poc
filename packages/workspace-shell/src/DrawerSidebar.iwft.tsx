import { test, expect } from '../../../playwright/fixtures'
import { ShellProviders } from '../../../playwright/mount-wrapper'
import { DrawerSidebar } from './DrawerSidebar'

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
  await expect(page.getByRole('group', { name: 'Capture' }).getByRole('button')).toHaveText(['Audio CaptureRecord or upload a lecture', 'ResourcesLinks and notes for a course or lecture'])
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
