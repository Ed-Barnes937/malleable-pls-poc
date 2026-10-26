import { test, expect } from '@playwright/test'
import { TopBarPom, PanelGridPom, SidebarPom } from './pom'

test.describe('Journey: New lecture recording', () => {
  test('clearing the recording focus resets Audio Capture to ready state', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    // Switch to "In Lecture" workspace
    await topBar.switchToWorkspace('In Lecture')
    await topBar.expectActiveWorkspace('In Lecture')

    // Verify panels are present
    await grid.expectHasPanel('Audio Capture')
    await grid.expectHasPanel('Transcript')

    // The workspace is seeded with focus on a complete recording — Audio
    // Capture shows its total duration. (The "Recording complete … total"
    // summary block is gated behind a @tall container query and stays hidden
    // at the seeded 240px height.)
    const audioPanel = grid.panelByLabel('Audio Capture')
    await expect(audioPanel.getByText('47:12', { exact: true }).first()).toBeVisible({ timeout: 10000 })

    // Clear the workspace recording focus from the sidebar Scope section.
    await topBar.openDrawer()
    const sidebar = new SidebarPom(page)
    await expect(sidebar.recordingSelect).toHaveValue('rec-bio-4', { timeout: 10000 })
    await sidebar.selectRecording('No recording selected')

    // Audio Capture transitions to idle/ready state
    await expect(audioPanel.getByText('Ready to record')).toBeVisible({ timeout: 5000 })

    // Restore so later tests see clean state.
    await sidebar.selectRecording('Biology Lecture: Mitochondrial DNA')
    await expect(sidebar.recordingSelect).toHaveValue('rec-bio-4', { timeout: 10000 })
    await expect(audioPanel.getByText('47:12', { exact: true }).first()).toBeVisible()
  })
})
