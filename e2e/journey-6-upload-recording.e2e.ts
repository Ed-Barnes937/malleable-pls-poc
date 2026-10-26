import path from 'path'
import { test, expect } from '@playwright/test'
import { AudioCapturePom, PanelGridPom, SidebarPom, TopBarPom } from './pom'

const FIXTURE = path.join(__dirname, 'fixtures', 'lecture-tone.wav')

test.describe('Journey: Upload a lecture recording', () => {
  test('uploaded recording becomes the focus and its transcript appears', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    await topBar.switchToWorkspace('In Lecture')
    await topBar.expectActiveWorkspace('In Lecture')
    const audio = new AudioCapturePom(grid.panelByLabel('Audio Capture'))
    const transcript = grid.panelByLabel('Transcript')

    // Title defaults from the filename; the student renames it and files it under a course.
    await audio.pickFile(FIXTURE)
    await expect(audio.titleInput).toHaveValue('lecture-tone')
    await audio.submitUpload({ title: 'Uploaded: Enzyme Kinetics', course: 'Biology' })

    // The new recording becomes the workspace focus, so the Transcript lens
    // follows it and fills in once the (mock) transcription job completes.
    await expect(transcript.getByText('Uploaded: Enzyme Kinetics')).toBeVisible({ timeout: 10000 })
    await expect(transcript.getByText(/Welcome to today's lecture/)).toBeVisible({ timeout: 20000 })
    await expect(transcript.getByText('3 segments')).toBeVisible()

    await topBar.openDrawer()
    const sidebar = new SidebarPom(page)
    await expect(sidebar.recordingSelect.locator('option:checked')).toHaveText('Uploaded: Enzyme Kinetics')

    // Restore the seeded focus so later tests see clean state.
    await sidebar.selectRecording('Biology Lecture: Mitochondrial DNA')
    await expect(sidebar.recordingSelect).toHaveValue('rec-bio-4', { timeout: 10000 })
  })
})
