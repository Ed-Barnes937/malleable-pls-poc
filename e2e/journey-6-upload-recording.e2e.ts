import path from 'path'
import { test, expect, type APIRequestContext } from '@playwright/test'
import type { Lecture } from '../packages/substrate/src'
import { AudioCapturePom, PanelGridPom, SidebarPom, TopBarPom } from './pom'
import { trpcQuery } from './api'
import { reseed } from './reseed'

const FIXTURE = path.join(__dirname, 'fixtures', 'lecture-tone.wav')
const DEMO_LECTURE = path.join(__dirname, '..', 'demo', 'lecture-mitochondrial-dna.wav')
const SEEDED = { id: 'lec-rec-bio-4', title: 'Biology Lecture: Mitochondrial DNA' }

const lectures = (request: APIRequestContext) => trpcQuery<Lecture[]>(request, 'lectures.list', {})

test.describe('Journey: Upload a lecture recording', () => {
  // Each upload makes a lecture, so every test starts from the seed.
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  /**
   * In Lecture opens on the seeded lecture, so an upload would add a part to
   * it: New lecture lets go of it first, on the board and in the widget.
   */
  async function startNewLecture(page: import('@playwright/test').Page) {
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('In Lecture')
    await topBar.expectActiveWorkspace('In Lecture')
    const audio = new AudioCapturePom(grid.panelByLabel('Audio Capture'))
    await expect(topBar.scopeChip).toHaveText(`Showing: Biology · ${SEEDED.title}`, { timeout: 10000 })
    await audio.root.getByRole('button', { name: 'New lecture' }).click()
    await expect(topBar.scopeChip).toHaveText('Showing: Biology', { timeout: 10000 })
    await expect(audio.root.getByTestId('ready-to-record')).toHaveText('Ready to record')
    return { topBar, audio, transcript: grid.panelByLabel('Transcript') }
  }

  test('an upload after New lecture is a new lecture: it becomes the board lecture and its transcript appears', async ({ page, request }) => {
    const before = (await lectures(request)).map((l) => l.id)
    await page.goto('/')
    const { topBar, audio, transcript } = await startNewLecture(page)

    // Title defaults from the filename; the student renames it and files it under a course.
    await audio.pickFile(FIXTURE)
    await expect(audio.titleInput).toHaveValue('lecture-tone')
    await audio.submitUpload({ title: 'Uploaded: Enzyme Kinetics', course: 'Biology' })

    // The new lecture becomes the board's lecture, so the Transcript lens
    // follows it and fills in once the (mock) transcription job completes.
    await expect(topBar.scopeChip).toHaveText('Showing: Biology · Uploaded: Enzyme Kinetics', { timeout: 10000 })
    await expect(transcript.getByTestId('lecture-title')).toHaveText('Uploaded: Enzyme Kinetics')
    // The segment, not the summary: the (mock) summary quotes the same line once its job finishes.
    await expect(transcript.getByRole('button', { name: /Today we're looking at mitochondrial DNA/ })).toBeVisible({ timeout: 20000 })
    await expect(transcript.getByText('6 segments')).toBeVisible()

    // A lecture of its own, in Biology; the seeded lecture keeps its one part.
    const made = (await lectures(request)).filter((l) => !before.includes(l.id))
    expect(made).toEqual([expect.objectContaining({ title: 'Uploaded: Enzyme Kinetics', course: 'biology' })])
    expect(made[0].recordings).toHaveLength(1)
    expect((await trpcQuery<Lecture>(request, 'lectures.byId', SEEDED.id)).recordings).toHaveLength(1)

    await topBar.openDrawer()
    const sidebar = new SidebarPom(page)
    await expect(sidebar.lectureSelect).toHaveValue(made[0].id)
  })

  test('the prepared demo lecture transcribes to its real script in mock mode', async ({ page, request }) => {
    const before = (await lectures(request)).map((l) => l.id)
    await page.goto('/')
    const { topBar, audio, transcript } = await startNewLecture(page)

    await audio.pickFile(DEMO_LECTURE)
    await audio.submitUpload({ title: 'Uploaded: Demo lecture', course: 'Biology' })

    // Matched by file hash (apps/server/src/ai/demo-lecture.ts): one moment per script paragraph.
    await expect(topBar.scopeChip).toHaveText('Showing: Biology · Uploaded: Demo lecture', { timeout: 10000 })
    await expect(transcript.getByTestId('lecture-title')).toHaveText('Uploaded: Demo lecture')
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

    const made = (await lectures(request)).filter((l) => !before.includes(l.id))
    expect(made).toEqual([expect.objectContaining({ title: 'Uploaded: Demo lecture', course: 'biology' })])
    expect((await trpcQuery<Lecture>(request, 'lectures.byId', SEEDED.id)).recordings).toHaveLength(1)
  })
})
