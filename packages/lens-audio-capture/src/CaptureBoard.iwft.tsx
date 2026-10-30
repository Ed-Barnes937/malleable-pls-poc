import { test, expect } from '../../../playwright/fixtures'
import type { BackendSimulator } from '../../../playwright/backend-simulator'
import { CaptureBoardHarness } from '../../../playwright/capture-board-harness'

// Record and Transcript on one board (02 phase 3): the lecture exists from
// the moment capture starts, the server selects it, and the Transcript
// says it is being recorded.

const MEDIA_RECORDER_MOCK = `
  class MockMediaRecorder {
    constructor() { this.state = 'inactive'; this.ondataavailable = null; this.onstop = null; }
    static isTypeSupported() { return true; }
    start() {
      this.state = 'recording';
      setTimeout(() => { this.ondataavailable && this.ondataavailable({ data: new Blob(['fake-audio'], { type: 'audio/webm' }) }); }, 50);
    }
    stop() {
      this.state = 'inactive';
      this.ondataavailable && this.ondataavailable({ data: new Blob(['final-chunk'], { type: 'audio/webm' }) });
      setTimeout(() => { this.onstop && this.onstop(); }, 10);
    }
  }
  window.MediaRecorder = MockMediaRecorder;
  const track = { stop() {}, kind: 'audio', enabled: true };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track], active: true };
  if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {}, writable: true });
  navigator.mediaDevices.getUserMedia = async () => stream;
`

async function injectMocks(page: import('@playwright/test').Page, { denyMic = false } = {}) {
  await page.evaluate(({ script, denyMic }) => {
    new Function(script)()
    if (denyMic) navigator.mediaDevices.getUserMedia = async () => { throw new Error('NotAllowedError') }
  }, { script: MEDIA_RECORDER_MOCK, denyMic })
}

/** The board shows `course` and no lecture. */
function boardOn(simulator: BackendSimulator, course: string | null) {
  simulator.db.workspaceScopes = simulator.db.workspaceScopes.filter((s) => s.workspace_id !== 'ws-in-lecture')
  if (course) simulator.db.workspaceScopes.push({ id: 'scope-test', workspace_id: 'ws-in-lecture', scope_type: 'tag', scope_value: course })
}

/**
 * /upload, as the server does it: the recording goes into `x-lecture-id`.
 * Holds each upload until `release()`, and records the headers sent.
 */
async function serveUploads(page: import('@playwright/test').Page, simulator: BackendSimulator) {
  const uploads: Record<string, string>[] = []
  let release!: () => void
  const released = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/upload', async (route) => {
    const headers = route.request().headers()
    uploads.push(headers)
    await released
    const id = `rec-captured-${uploads.length}`
    const lectureId = simulator.db.addRecording(
      { id, title: decodeURIComponent(headers['x-recording-title']), created_at: new Date().toISOString(), duration: 2000, audio_url: null, status: 'transcribing' },
      { lectureId: headers['x-lecture-id'] },
    )
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id, lectureId, selected: false }) })
  })
  return { uploads, release }
}

const scopeText = (page: import('@playwright/test').Page) => page.getByTestId('board-scope')

test.describe('Record and Transcript on one board', () => {
  test('Record with no lecture makes and selects the lecture as capture starts; the Transcript says Recording...', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    boardOn(simulator, 'biology')
    const { uploads, release } = await serveUploads(page, simulator)
    await mount(<CaptureBoardHarness />)
    await expect(scopeText(page)).toHaveText('biology / no lecture')
    const lecturesBefore = simulator.db.lectures.length

    await page.getByRole('button', { name: 'Start recording' }).click()

    // Before any audio: the lecture exists, the board shows it, and so does the Transcript.
    await expect(scopeText(page)).toHaveText(/^biology \/ lec-/)
    expect(simulator.db.lectures).toHaveLength(lecturesBefore + 1)
    const lecture = simulator.db.lectures.at(-1)!
    expect(lecture).toMatchObject({ course: 'biology', class_item_id: null })
    expect(lecture.title).toMatch(/^Biology lecture \d+ \w+, \d\d:\d\d$/)
    await expect(page.getByTestId('recording-into')).toHaveText(lecture.title)
    const transcript = page.getByTestId('transcript')
    await expect(transcript.getByTestId('lecture-title')).toHaveText(lecture.title)
    await expect(transcript.getByTestId('recording-live')).toHaveText('Recording...')

    await page.getByRole('button', { name: 'Stop recording' }).click()
    await expect(transcript.getByTestId('recording-saving')).toHaveText('Saving the recording...')
    release()

    // Into the lecture made at the start; the client selects nothing itself.
    await expect.poll(() => uploads.length).toBe(1)
    expect(uploads[0]['x-lecture-id']).toBe(lecture.id)
    expect(uploads[0]['x-select-on-board']).toBeUndefined()
    await expect(transcript.getByTestId('recording-live')).toHaveCount(0)
    await expect(transcript.getByTestId('recording-saving')).toHaveCount(0)
    await expect(scopeText(page)).toHaveText(`biology / ${lecture.id}`)
    expect(simulator.db.lectures).toHaveLength(lecturesBefore + 1)
  })

  test('Record during a class of the board course joins that class occurrence', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    boardOn(simulator, 'biology')
    // Mon 26 Oct 2026, 10:30 London: the Biology lecture (Mondays 10:00-12:00) is on.
    simulator.freezeNow(new Date('2026-10-26T10:30:00Z'))
    const now = '2026-10-01T00:00:00.000Z'
    simulator.db.planItems.push({
      id: 'bio-class', kind: 'commitment', title: 'Biology lecture', subtype: 'class', status: 'open',
      starts_at: '2026-10-19T09:00:00.000Z', ends_at: '2026-10-19T11:00:00.000Z', due_at: null, duration_min: null,
      recurrence: { freq: 'weekly', timeZone: 'Europe/London' }, source_type: null, source_id: null, source_offset_ms: null,
      created_by_workflow_id: null, created_at: now, updated_at: now,
    })
    simulator.db.tags.push({ id: 'tag-bio-class', target_type: 'plan_item', target_id: 'bio-class', label: 'biology', created_at: now })
    await serveUploads(page, simulator)
    await mount(<CaptureBoardHarness />)
    await expect(scopeText(page)).toHaveText('biology / no lecture')

    await page.getByRole('button', { name: 'Start recording' }).click()

    await expect(page.getByTestId('recording-into')).toHaveText('Biology lecture · Mon 26 Oct')
    const lecture = simulator.db.lectures.find((l) => l.class_item_id === 'bio-class')!
    expect(lecture).toMatchObject({ class_date: '2026-10-26', course: 'biology' })
    await expect(scopeText(page)).toHaveText(`biology / ${lecture.id}`)
    await expect(page.getByTestId('transcript').getByTestId('recording-live')).toHaveText('Recording...')
  })

  test('mic refused: the new lecture stays, empty, and nothing says it is recording', async ({ mount, page, simulator }) => {
    await injectMocks(page, { denyMic: true })
    boardOn(simulator, 'chemistry')
    await mount(<CaptureBoardHarness />)
    await page.getByRole('button', { name: 'Start recording' }).click()

    await expect(page.getByText('Microphone access denied')).toBeVisible()
    await expect(scopeText(page)).toHaveText(/^chemistry \/ lec-/)
    const transcript = page.getByTestId('transcript')
    await expect(transcript.getByText('No recording yet')).toBeVisible()
    await expect(transcript.getByTestId('recording-live')).toHaveCount(0)
    await expect(page.getByTestId('ready-to-record')).toContainText('Ready to record Chemistry lecture')
  })

  test('Record more on a lecture with audio says which part is recording', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    const { release } = await serveUploads(page, simulator)
    // ws-in-lecture opens on the seeded Biology lecture, which has one part.
    await mount(<CaptureBoardHarness />)
    await expect(scopeText(page)).toHaveText('biology / lec-rec-bio-4')
    const lecturesBefore = simulator.db.lectures.length

    await page.getByRole('button', { name: 'Record more' }).click()
    const transcript = page.getByTestId('transcript')
    await expect(transcript.getByTestId('recording-live')).toHaveText('Recording part 2...')
    await expect(page.getByTestId('recording-into')).toHaveText('Biology Lecture: Mitochondrial DNA')
    await page.getByRole('button', { name: 'Stop recording' }).click()
    await expect(transcript.getByTestId('recording-saving')).toHaveText('Saving part 2...')
    release()
    await expect(transcript.getByTestId('recording-saving')).toHaveCount(0)
    expect(simulator.db.lectures).toHaveLength(lecturesBefore)
  })
})
