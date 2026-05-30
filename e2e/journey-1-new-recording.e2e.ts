import { test, expect } from '@playwright/test'
import { TopBarPom, PanelGridPom } from './pom'

test.describe('Journey: New lecture recording', () => {
  test('selecting "Start new recording" in audio-capture picker resets to ready state', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    // Switch to "In Lecture" workspace
    await topBar.switchToWorkspace('In Lecture')
    await topBar.expectActiveWorkspace('In Lecture')

    // Verify panels are present
    await grid.expectHasPanel('Audio Capture')
    await grid.expectHasPanel('Transcript')

    // Audio Capture is seeded to a complete recording
    const audioPanel = grid.panelByLabel('Audio Capture')
    await expect(audioPanel.getByText(/Recording complete|total/)).toBeVisible({ timeout: 10000 })

    // Use the per-panel target picker to start a new recording.
    // (The old workspace-level "New Recording" button was removed in the
    // scope rethink — recording is now a per-panel target.)
    const audioPicker = audioPanel.getByTestId('recording-picker')
    await audioPicker.selectOption({ label: 'Start new recording' })

    // Audio Capture transitions to idle/ready state
    await expect(audioPanel.getByText('Ready to record')).toBeVisible({ timeout: 5000 })
  })
})
