import { test, expect } from '@playwright/test'
import { SidebarPom, PanelGridPom } from './pom'

test.describe('Journey: New lecture recording', () => {
  test('new recording button clears scope and shows ready state', async ({ page }) => {
    await page.goto('/')
    const sidebar = new SidebarPom(page)
    const grid = new PanelGridPom(page)

    // Switch to "In Lecture" workspace
    await sidebar.switchToWorkspace('In Lecture')
    await sidebar.expectActiveWorkspace('In Lecture')

    // Verify panels are present
    await grid.expectHasPanel('Audio Capture')
    await grid.expectHasPanel('Transcript')

    // AudioCapture should show complete state (existing recording in scope)
    const audioPanel = grid.panelByLabel('Audio Capture')
    await expect(audioPanel.getByText(/Recording complete|total/)).toBeVisible({ timeout: 10000 })

    // Click "New Recording" button in sidebar
    const newRecordingButton = sidebar.scopeSection.getByRole('button', { name: /new recording/i })
    await expect(newRecordingButton).toBeVisible()
    await newRecordingButton.click()

    // AudioCapture should transition to idle/ready state
    await expect(audioPanel.getByText('Ready to record')).toBeVisible({ timeout: 5000 })

    // Recording dropdown should show "All recordings" (scope cleared)
    await expect(sidebar.recordingSelect).toHaveValue('')

    // Transcript should show empty state (no recording selected)
    const transcriptPanel = grid.panelByLabel('Transcript')
    await expect(transcriptPanel.getByText('Select a recording in scope to view transcript')).toBeVisible()
  })
})
