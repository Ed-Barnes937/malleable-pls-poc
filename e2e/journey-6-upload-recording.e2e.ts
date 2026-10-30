import path from 'path'
import { test, expect } from '@playwright/test'
import { AudioCapturePom, PanelGridPom, SidebarPom, TopBarPom } from './pom'

const FIXTURE = path.join(__dirname, 'fixtures', 'lecture-tone.wav')
const DEMO_LECTURE = path.join(__dirname, '..', 'demo', 'lecture-mitochondrial-dna.wav')

test.describe('Journey: Upload a lecture recording', () => {
  test('an upload after New lecture is a new lecture: it becomes the board lecture and its transcript appears', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    await topBar.switchToWorkspace('In Lecture')
    await topBar.expectActiveWorkspace('In Lecture')
    const audio = new AudioCapturePom(grid.panelByLabel('Audio Capture'))
    const transcript = grid.panelByLabel('Transcript')

    // In Lecture opens on the seeded lecture, so an upload would add to it:
    // New lecture clears it first.
    await audio.root.getByRole('button', { name: 'New lecture' }).click()
    await expect(audio.root.getByText('Ready to record')).toBeVisible({ timeout: 10000 })
    // Title defaults from the filename; the student renames it and files it under a course.
    await audio.pickFile(FIXTURE)
    await expect(audio.titleInput).toHaveValue('lecture-tone')
    await audio.submitUpload({ title: 'Uploaded: Enzyme Kinetics', course: 'Biology' })

    // The new lecture becomes the board's lecture, so the Transcript lens
    // follows it and fills in once the (mock) transcription job completes.
    await expect(transcript.getByText('Uploaded: Enzyme Kinetics')).toBeVisible({ timeout: 10000 })
    // The segment, not the summary: the (mock) summary quotes the same line once its job finishes.
    await expect(transcript.getByRole('button', { name: /Today we're looking at mitochondrial DNA/ })).toBeVisible({ timeout: 20000 })
    await expect(transcript.getByText('6 segments')).toBeVisible()

    await topBar.openDrawer()
    const sidebar = new SidebarPom(page)
    await expect(sidebar.lectureSelect.locator('option:checked')).toHaveText('Uploaded: Enzyme Kinetics')

    // Restore the seeded focus so later tests see clean state.
    await sidebar.selectLecture('Biology Lecture: Mitochondrial DNA')
    await expect(sidebar.lectureSelect).toHaveValue('lec-rec-bio-4', { timeout: 10000 })
  })

  test('the prepared demo lecture transcribes to its real script in mock mode', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    await topBar.switchToWorkspace('In Lecture')
    const audio = new AudioCapturePom(grid.panelByLabel('Audio Capture'))
    const transcript = grid.panelByLabel('Transcript')

    await audio.root.getByRole('button', { name: 'New lecture' }).click()
    await audio.pickFile(DEMO_LECTURE)
    await audio.submitUpload({ title: 'Uploaded: Demo lecture', course: 'Biology' })

    // Matched by file hash (apps/server/src/ai/demo-lecture.ts): one moment per script paragraph.
    await expect(transcript.getByText('Uploaded: Demo lecture')).toBeVisible({ timeout: 10000 })
    await expect(transcript.getByText(/let me try to explain maternal inheritance/)).toBeVisible({ timeout: 20000 })
    await expect(transcript.getByText('17 segments')).toBeVisible()
    // Not the canned mock lecture (apps/server/src/ai/transcriber.ts).
    await expect(transcript.getByText(/^Welcome back\./)).toHaveCount(0)
    // The (fake) summary is built from the real script.
    const summary = transcript.getByRole('region', { name: 'Lecture summary' })
    await expect(summary.getByTestId('summary-line')).toBeVisible({ timeout: 20000 })
    await summary.getByRole('button', { name: 'Show summary' }).click()
    await expect(summary.getByRole('listitem')).toHaveCount(3)
    await expect(summary).toContainText(/mitochondrial DNA/i)

    const sidebar = new SidebarPom(page)
    await topBar.openDrawer()
    await sidebar.selectLecture('Biology Lecture: Mitochondrial DNA')
    await expect(sidebar.lectureSelect).toHaveValue('lec-rec-bio-4', { timeout: 10000 })
  })
})
