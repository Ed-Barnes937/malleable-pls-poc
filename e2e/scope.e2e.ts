import { test, expect } from '@playwright/test'
import { SidebarPom } from './pom'

/**
 * After the workspace-scope rethink, the Scope section is driven by the
 * union of `manifest.filters` across the lenses present in the workspace.
 *
 * Default workspace is `ws-in-lecture` (audio-capture + transcript) which
 * declares no filter dims — so its drawer renders no Scope section.
 *
 * Evening Review contains test-me + weekly-overview which declare both
 * `courseTag` and `timeframe`, so it renders Course + Timeframe pickers.
 *
 * The old workspace-level Recording dropdown no longer exists — per-panel
 * target pickers replaced it.
 */

async function openDrawer(page: import('@playwright/test').Page) {
  await page.getByTestId('drawer-trigger').click()
  await expect(page.getByTestId('drawer-sidebar')).toBeVisible()
}

async function switchWorkspace(page: import('@playwright/test').Page, name: string) {
  // Workspaces live in the TopBar's WorkspaceSwitcher, not the drawer aside.
  await page.getByTestId('top-bar').getByRole('button', { name, exact: true }).click()
}

test.describe('Scope filtering', () => {
  test('In Lecture workspace renders no Scope section', async ({ page }) => {
    await page.goto('/')
    await switchWorkspace(page, 'In Lecture')
    await openDrawer(page)

    const sidebar = new SidebarPom(page)
    await expect(sidebar.scopeSection).toHaveCount(0)
  })

  test('Evening Review shows Course + Timeframe pickers but no Recording', async ({ page }) => {
    await page.goto('/')
    await switchWorkspace(page, 'Evening Review')
    await openDrawer(page)

    const sidebar = new SidebarPom(page)
    await expect(sidebar.scopeSection).toBeVisible()
    await expect(sidebar.courseSelect).toBeVisible()
    await expect(sidebar.timeframeSelect).toBeVisible()
    // The old workspace-level recording picker is gone — recording is now
    // a per-panel target, not a workspace-level filter.
    await expect(sidebar.scopeSection.getByRole('combobox', { name: 'Recording filter' })).toHaveCount(0)
  })

  test('changing course persists', async ({ page }) => {
    await page.goto('/')
    await switchWorkspace(page, 'Evening Review')
    await openDrawer(page)

    const sidebar = new SidebarPom(page)
    await expect(sidebar.courseSelect).toHaveValue('biology', { timeout: 10000 })

    await sidebar.selectCourse('Chemistry')
    await expect(sidebar.courseSelect).toHaveValue('chemistry', { timeout: 10000 })

    await sidebar.selectCourse('All courses')
    await expect(sidebar.courseSelect).toHaveValue('', { timeout: 10000 })

    // Restore so later tests see clean state.
    await sidebar.selectCourse('Biology')
    await expect(sidebar.courseSelect).toHaveValue('biology')
  })

  test('changing timeframe persists', async ({ page }) => {
    await page.goto('/')
    await switchWorkspace(page, 'Evening Review')
    await openDrawer(page)

    const sidebar = new SidebarPom(page)
    await expect(sidebar.timeframeSelect).toHaveValue('week', { timeout: 10000 })

    await sidebar.selectTimeframe('All time')
    await expect(sidebar.timeframeSelect).toHaveValue('all', { timeout: 10000 })

    await sidebar.selectTimeframe('No filter')
    await expect(sidebar.timeframeSelect).toHaveValue('', { timeout: 10000 })

    // Restore so later tests see clean state.
    await sidebar.selectTimeframe('This week')
    await expect(sidebar.timeframeSelect).toHaveValue('week')
  })
})
