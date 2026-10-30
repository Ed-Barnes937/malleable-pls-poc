import { test, expect } from '@playwright/test'
import { TopBarPom, PanelGridPom } from './pom'

test.describe('Journey: New lecture recording', () => {
  test('clearing the board lecture resets Audio Capture to ready state', async ({ page }) => {
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

    // Clear the board's lecture from the header's lecture picker.
    await expect(topBar.lectureSelect).toHaveValue('lec-rec-bio-4', { timeout: 10000 })
    await topBar.selectLecture('No lecture')
    await topBar.expectScope('Biology', null)

    // Audio Capture transitions to idle/ready state
    await expect(audioPanel.getByText('Ready to record')).toBeVisible({ timeout: 5000 })

    // Restore so later tests see clean state.
    await topBar.selectLecture('Biology Lecture: Mitochondrial DNA')
    await expect(topBar.lectureSelect).toHaveValue('lec-rec-bio-4', { timeout: 10000 })
    await expect(audioPanel.getByText('47:12', { exact: true }).first()).toBeVisible()
  })
})
