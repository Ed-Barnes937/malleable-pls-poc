import { test, expect, EndpointBehaviour } from '../../../playwright/fixtures'
import { ShellProviders } from '../../../playwright/mount-wrapper'
import { Sidebar } from './Sidebar'

test('renders workspace list from seed data', async ({ mount, page, simulator }) => {
  const component = await mount(
    <ShellProviders>
      <Sidebar />
    </ShellProviders>,
  )

  await expect(page.getByText('In Lecture')).toBeVisible()
  await expect(page.getByText('Evening Review')).toBeVisible()
  await expect(page.getByText('Exam Prep')).toBeVisible()
  await expect(page.getByText('New workspace')).toBeVisible()
})

test('renders scope editor with current scope values', async ({ mount, page, simulator }) => {
  const component = await mount(
    <ShellProviders>
      <Sidebar />
    </ShellProviders>,
  )

  const courseSelect = page.getByRole('combobox').first()
  await expect(courseSelect).toBeVisible()
})

test('shows lens palette with tools and views', async ({ mount, page, simulator }) => {
  const component = await mount(
    <ShellProviders>
      <Sidebar />
    </ShellProviders>,
  )

  await expect(page.getByText('Tools')).toBeVisible()
  await expect(page.getByText('Views')).toBeVisible()
  await expect(page.getByText('Audio Capture')).toBeVisible()
  await expect(page.getByText('Transcript')).toBeVisible()
})

test('error state: workspaces.list returns error gracefully', async ({ mount, page, simulator }) => {
  simulator.setBehaviour('workspaces.list', EndpointBehaviour.ERROR)

  const component = await mount(
    <ShellProviders>
      <Sidebar />
    </ShellProviders>,
  )

  // Sidebar should not crash — workspace list just won't render
  await expect(page.getByText('Workspaces')).toBeVisible()
  await expect(page.getByText('In Lecture')).not.toBeVisible()
})
