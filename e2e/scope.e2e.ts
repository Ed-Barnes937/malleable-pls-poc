import { test, expect } from '@playwright/test'
import { SidebarPom, TopBarPom } from './pom'

/**
 * The Scope section is driven by the union of `manifest.filters` across the
 * lenses present in the workspace.
 *
 * In Lecture (audio-capture + transcript) declares only `recordingId`, so
 * its drawer shows just the Recording focus picker.
 *
 * Evening Review adds test-me + weekly-overview, which declare `courseTag`
 * and `timeframe`, so it shows Course + Timeframe + Recording.
 */

test.describe('Scope filtering', () => {
  test('In Lecture shows only the Recording focus picker', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('In Lecture')
    await topBar.openDrawer()

    const sidebar = new SidebarPom(page)
    await expect(sidebar.scopeSection).toBeVisible()
    await expect(sidebar.recordingSelect).toHaveValue('rec-bio-4', { timeout: 10000 })
    await expect(sidebar.courseSelect).toHaveCount(0)
    await expect(sidebar.timeframeSelect).toHaveCount(0)
  })

  test('Evening Review shows Course, Timeframe and Recording pickers', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Evening Review')
    await topBar.openDrawer()

    const sidebar = new SidebarPom(page)
    await expect(sidebar.scopeSection).toBeVisible()
    await expect(sidebar.courseSelect).toBeVisible()
    await expect(sidebar.timeframeSelect).toBeVisible()
    await expect(sidebar.recordingSelect).toHaveValue('rec-bio-4', { timeout: 10000 })
  })

  test('changing course clears the recording focus', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Evening Review')
    await topBar.openDrawer()

    const sidebar = new SidebarPom(page)
    await expect(sidebar.recordingSelect).toHaveValue('rec-bio-4', { timeout: 10000 })

    // The focused biology recording is not in Chemistry — the server clears it.
    await sidebar.selectCourse('Chemistry')
    await expect(sidebar.courseSelect).toHaveValue('chemistry', { timeout: 10000 })
    await expect(sidebar.recordingSelect).toHaveValue('', { timeout: 10000 })

    // Restore so later tests see clean state.
    await sidebar.selectCourse('Biology')
    await expect(sidebar.courseSelect).toHaveValue('biology', { timeout: 10000 })
    await sidebar.selectRecording('Biology Lecture: Mitochondrial DNA')
    await expect(sidebar.recordingSelect).toHaveValue('rec-bio-4', { timeout: 10000 })
  })

  test('changing course persists', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Evening Review')
    await topBar.openDrawer()

    const sidebar = new SidebarPom(page)
    await expect(sidebar.courseSelect).toHaveValue('biology', { timeout: 10000 })

    await sidebar.selectCourse('Chemistry')
    await expect(sidebar.courseSelect).toHaveValue('chemistry', { timeout: 10000 })

    await sidebar.selectCourse('All courses')
    await expect(sidebar.courseSelect).toHaveValue('', { timeout: 10000 })

    // Restore so later tests see clean state.
    // Changing course also cleared the recording focus.
    await sidebar.selectCourse('Biology')
    await expect(sidebar.courseSelect).toHaveValue('biology')
    await sidebar.selectRecording('Biology Lecture: Mitochondrial DNA')
    await expect(sidebar.recordingSelect).toHaveValue('rec-bio-4', { timeout: 10000 })
  })

  test('changing timeframe persists', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Evening Review')
    await topBar.openDrawer()

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
