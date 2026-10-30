import { test, expect } from '../../../playwright/fixtures'
import { AudioCaptureHarness } from '../../../playwright/audio-capture-harness'
import AudioCaptureLens from './AudioCaptureLens'

const MEDIA_RECORDER_MOCK = `
  class MockMediaRecorder {
    constructor(stream, options) {
      window.__mediaRecorderOptions = options;
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onstop = null;
    }
    static isTypeSupported() { return true; }
    start() {
      this.state = 'recording';
      setTimeout(() => {
        if (this.ondataavailable) {
          this.ondataavailable({ data: new Blob(['fake-audio'], { type: 'audio/webm' }) });
        }
      }, 50);
    }
    stop() {
      this.state = 'inactive';
      if (this.ondataavailable) {
        this.ondataavailable({ data: new Blob(['final-chunk'], { type: 'audio/webm' }) });
      }
      setTimeout(() => { if (this.onstop) this.onstop(); }, 10);
    }
  }
  window.MediaRecorder = MockMediaRecorder;

  const mockTrack = { stop() {}, kind: 'audio', enabled: true };
  const mockStream = { getTracks: () => [mockTrack], getAudioTracks: () => [mockTrack], active: true };
  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', { value: {}, writable: true });
  }
  navigator.mediaDevices.getUserMedia = async () => mockStream;
`

async function injectMocks(page: import('@playwright/test').Page) {
  await page.evaluate((script) => {
    const fn = new Function(script)
    fn()
  }, MEDIA_RECORDER_MOCK)
}

async function injectMocksWithDeniedMic(page: import('@playwright/test').Page) {
  await injectMocks(page)
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('NotAllowedError') }
  })
}

test.describe('AudioCaptureLens', () => {
  test('shows idle state when no recording selected', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={{}} config={{}} />
      </AudioCaptureHarness>,
    )

    await expect(page.getByText('Ready to record')).toBeVisible()
    await expect(page.getByText('0:00')).toBeVisible()
  })

  test('a selected lecture with a recording plays its latest, and New lecture clears the board lecture', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    const patches: object[] = []
    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={{ lectureId: 'lec-rec-bio-4', courseTag: 'biology' }} config={{}} onScopeChange={(p) => { patches.push(p) }} />
      </AudioCaptureHarness>,
    )

    await expect(page.getByText('Biology Lecture: Mitochondrial DNA')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Record more' })).toBeVisible()
    await page.getByRole('button', { name: 'New lecture' }).click()
    // One patch, clearing the lecture (the course stays).
    expect(patches).toEqual([{ lectureId: undefined }])
    // At once, though the board (this mount's scope) still names the old
    // lecture: the next capture is a new lecture, not another part.
    await expect(page.getByTestId('ready-to-record')).toHaveText('Ready to record')
    let uploadHeaders: Record<string, string> | undefined
    await page.route('**/upload', async (route) => {
      uploadHeaders = route.request().headers()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'rec-fresh', lectureId: 'lec-fresh' }) })
    })
    const lecturesBefore = simulator.db.lectures.length
    await page.getByRole('button', { name: 'Start recording' }).click()
    await expect(page.getByText('REC')).toBeVisible()
    // A new Biology lecture, made as the capture starts.
    await expect.poll(() => simulator.db.lectures.length).toBe(lecturesBefore + 1)
    const fresh = simulator.db.lectures.at(-1)!
    expect(fresh.course).toBe('biology')
    await page.getByRole('button', { name: 'Stop recording' }).click()
    await expect.poll(() => uploadHeaders).toBeDefined()
    expect(uploadHeaders!['x-lecture-id']).toBe(fresh.id)
    // The server selects the new lecture; the widget wrote only New lecture's clear.
    expect(patches).toEqual([{ lectureId: undefined }])
  })

  test('New lecture says so when the board could not be changed, and keeps the lecture', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={{ lectureId: 'lec-rec-bio-4', courseTag: 'biology' }} config={{}} onScopeChange={async () => false} />
      </AudioCaptureHarness>,
    )

    await page.getByRole('button', { name: 'New lecture' }).click()
    await expect(page.getByRole('alert')).toHaveText("Couldn't start a new lecture - try again")
    await expect(page.getByText('Biology Lecture: Mitochondrial DNA')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Record more' })).toBeVisible()
  })

  test('shows nothing to press while the board lecture loads, rather than "Ready to record"', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    // Hold lectures.byId until the test lets it go.
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    await page.route('**/trpc/lectures.byId**', async (route) => {
      await held
      await route.fallback()
    })
    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={{ lectureId: 'lec-rec-bio-4', courseTag: 'biology' }} config={{}} />
      </AudioCaptureHarness>,
    )

    await expect(page.getByText('0:00')).toBeVisible()
    await expect(page.getByTestId('ready-to-record')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Start recording' })).toHaveCount(0)
    release()
    await expect(page.getByRole('button', { name: 'Record more' })).toBeVisible()
  })

  test('a selected lecture with no recording is ready to record into it, by name', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    simulator.db.lectures.push({
      id: 'lec-empty', title: 'Biology lecture 30 Oct, 10:04', course: 'biology', starts_at: '2026-10-30T10:04:00Z',
      class_item_id: null, class_date: null, created_at: '2026-10-30T10:04:00Z', updated_at: '2026-10-30T10:04:00Z',
    })
    let uploadHeaders: Record<string, string> = {}
    await page.route('**/upload', async (route) => {
      uploadHeaders = route.request().headers()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'rec-into', lectureId: 'lec-empty' }) })
    })
    const selected: (string | undefined)[] = []
    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={{ lectureId: 'lec-empty', courseTag: 'biology' }} config={{}} onScopeChange={(p) => { selected.push(p.lectureId) }} />
      </AudioCaptureHarness>,
    )

    await expect(page.getByTestId('ready-to-record')).toHaveText('Ready to record Biology lecture 30 Oct, 10:04')
    await page.getByRole('button', { name: 'Start recording' }).click()
    await expect(page.getByText('REC')).toBeVisible()
    await page.getByRole('button', { name: 'Stop recording' }).click()
    // Into the selected lecture: no new lecture, so no course header, and
    // no scope write (the board shows it already).
    await expect.poll(() => uploadHeaders['x-lecture-id']).toBe('lec-empty')
    expect(uploadHeaders['x-recording-course']).toBeUndefined()
    await expect(page.getByRole('button', { name: 'Record more' })).toBeVisible()
    expect(selected).toEqual([])
  })

  test('a capture goes into the lecture it started in, even if the board switches lecture meanwhile', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    let uploadHeaders: Record<string, string> | undefined
    await page.route('**/upload', async (route) => {
      uploadHeaders = route.request().headers()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'rec-part-2', lectureId: 'lec-rec-bio-4' }) })
    })
    const patches: object[] = []
    const lens = (scope: { lectureId?: string; courseTag?: string }) => (
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={scope} config={{}} onScopeChange={(p) => { patches.push(p) }} />
      </AudioCaptureHarness>
    )
    const component = await mount(lens({ lectureId: 'lec-rec-bio-4', courseTag: 'biology' }))

    await page.getByRole('button', { name: 'Record more' }).click()
    await expect(page.getByText('REC')).toBeVisible()
    // Mid-recording, the board moves to another lecture (e.g. from the drawer).
    await component.update(lens({ lectureId: 'lec-rec-bio-3', courseTag: 'biology' }))
    await expect(page.getByText('REC')).toBeVisible()
    await page.getByRole('button', { name: 'Stop recording' }).click()

    await expect.poll(() => uploadHeaders?.['x-lecture-id']).toBe('lec-rec-bio-4')
    // Saved where it was aimed, said so, and the board keeps what it shows now.
    await expect(page.getByRole('status')).toHaveText('Saved to Biology Lecture: Mitochondrial DNA')
    await expect(page.getByText('Biology Lecture: Mitochondria & Energy')).toBeVisible()
    expect(patches).toEqual([])
  })

  test('a capture with no lecture makes one in the course it started in, and keeps it there if the board moves on', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    let uploadHeaders: Record<string, string> | undefined
    await page.route('**/upload', async (route) => {
      uploadHeaders = route.request().headers()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'rec-new', lectureId: uploadHeaders['x-lecture-id'], selected: false }) })
    })
    const patches: object[] = []
    const lens = (scope: { lectureId?: string; courseTag?: string }) => (
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={scope} config={{}} onScopeChange={(p) => { patches.push(p) }} />
      </AudioCaptureHarness>
    )
    const component = await mount(lens({ courseTag: 'biology' }))
    const lecturesBefore = simulator.db.lectures.length

    await page.getByRole('button', { name: 'Start recording' }).click()
    await expect(page.getByText('REC')).toBeVisible()
    // The lecture is made as capture starts, in the board course.
    await expect.poll(() => simulator.db.lectures.length).toBe(lecturesBefore + 1)
    const made = simulator.db.lectures.at(-1)!
    expect(made.course).toBe('biology')
    await expect(page.getByTestId('recording-into')).toHaveText(made.title)
    await component.update(lens({ courseTag: 'chemistry', lectureId: 'lec-rec-chem-1' }))
    await page.getByRole('button', { name: 'Stop recording' }).click()

    await expect.poll(() => uploadHeaders).toBeDefined()
    expect(uploadHeaders!['x-lecture-id']).toBe(made.id)
    expect(uploadHeaders!['x-recording-course']).toBeUndefined()
    await expect(page.getByRole('status')).toHaveText(`Saved to ${made.title}`)
    expect(patches).toEqual([])
  })

  test('when the lecture is gone, the audio is saved straight away as a new lecture in its course', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    const uploads: Record<string, string>[] = []
    await page.route('**/upload', async (route) => {
      const headers = route.request().headers()
      uploads.push(headers)
      if (headers['x-lecture-id']) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Lecture not found' }) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'rec-saved', lectureId: 'lec-saved', selected: true }) })
      }
    })
    const patches: object[] = []
    await mount(
      <AudioCaptureHarness boardId="ws-in-lecture">
        <AudioCaptureLens panelId="test" scope={{ lectureId: 'lec-rec-bio-4', courseTag: 'biology' }} config={{}} onScopeChange={(p) => { patches.push(p) }} />
      </AudioCaptureHarness>,
    )

    await page.getByRole('button', { name: 'Record more' }).click()
    await expect(page.getByText('REC')).toBeVisible()
    await page.getByRole('button', { name: 'Stop recording' }).click()

    await expect.poll(() => uploads.length).toBe(2)
    expect(uploads[0]['x-lecture-id']).toBe('lec-rec-bio-4')
    // Same audio, same title, as a new Biology lecture the server selects on the board.
    expect(uploads[1]['x-lecture-id']).toBeUndefined()
    expect(uploads[1]['x-recording-course']).toBe('biology')
    expect(uploads[1]['x-select-on-board']).toBe('1')
    expect(uploads[1]['x-recording-title']).toBe(uploads[0]['x-recording-title'])
    await expect(page.getByRole('status')).toHaveText('That lecture was gone, so this was saved as a new lecture')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByTestId('not-saved')).toHaveCount(0)
    // The server selected it; the widget writes no scope.
    expect(patches).toEqual([])
  })

  test('clicking record starts recording state', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={{}} config={{}} />
      </AudioCaptureHarness>,
    )

    await expect(page.getByText('Ready to record')).toBeVisible()
    await page.locator('button').filter({ has: page.locator('.lucide-mic') }).click()
    await expect(page.getByText('REC')).toBeVisible()
    // 24 kbps measurably hurt Whisper accuracy.
    expect(await page.evaluate(() => (window as unknown as { __mediaRecorderOptions?: MediaRecorderOptions }).__mediaRecorderOptions?.audioBitsPerSecond)).toBe(48_000)
  })

  test('stopping recording uploads and transitions to complete', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    await page.route('**/upload', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'rec-new-1', lectureId: 'lec-new-1' }),
      })
    })

    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={{}} config={{}} />
      </AudioCaptureHarness>,
    )

    await page.locator('button').filter({ has: page.locator('.lucide-mic') }).click()
    await expect(page.getByText('REC')).toBeVisible()
    await page.locator('button').filter({ has: page.locator('.lucide-square') }).click()
    await expect(page.getByText('Recording complete')).toBeVisible({ timeout: 5000 })
  })

  test('shows error when mic access is denied', async ({ mount, page, simulator }) => {
    await injectMocksWithDeniedMic(page)
    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={{}} config={{}} />
      </AudioCaptureHarness>,
    )

    await page.locator('button').filter({ has: page.locator('.lucide-mic') }).click()
    await expect(page.getByText('Microphone access denied')).toBeVisible()
  })

  test('a failed upload says it is not saved yet, and can be tried again or discarded', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    let attempts = 0
    const uploadIds: string[] = []
    await page.route('**/upload', async (route) => {
      attempts++
      uploadIds.push(route.request().headers()['x-upload-id'])
      if (attempts === 1) {
        await route.fulfill({ status: 500, body: 'Internal Server Error' })
      } else {
        const lectureId = route.request().headers()['x-lecture-id']
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'rec-retried', lectureId, selected: false }) })
      }
    })

    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={{}} config={{}} />
      </AudioCaptureHarness>,
    )

    await page.locator('button').filter({ has: page.locator('.lucide-mic') }).click()
    await expect(page.getByText('REC')).toBeVisible()
    await page.locator('button').filter({ has: page.locator('.lucide-square') }).click()
    await expect(page.getByText('Upload failed')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('not-saved')).toHaveText('Not saved yet')
    await expect(page.getByRole('button', { name: 'Discard' })).toBeVisible()

    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText('Recording complete')).toBeVisible()
    await expect(page.getByTestId('not-saved')).toHaveCount(0)
    expect(attempts).toBe(2)
    // One capture, one id on every try: a try the server saved (answer lost) isn't saved twice.
    expect(uploadIds[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(uploadIds[1]).toBe(uploadIds[0])
  })

  test('uploading a file with no lecture selected asks for a title and course, and the server selects its new lecture', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    let uploadHeaders: Record<string, string> = {}
    await page.route('**/upload', async (route) => {
      uploadHeaders = route.request().headers()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'rec-uploaded-1', lectureId: 'lec-uploaded-1', selected: true }),
      })
    })
    const focused: Array<string | undefined> = []

    await mount(
      <AudioCaptureHarness boardId="ws-in-lecture">
        <AudioCaptureLens
          panelId="test"
          scope={{ courseTag: 'biology' }}
          config={{}}
          onScopeChange={(patch) => { focused.push(patch.lectureId) }}
        />
      </AudioCaptureHarness>,
    )

    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Upload a recording' }).click()
    await (await chooser).setFiles({
      name: 'week-3_enzymes.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.from('ID3-fake-mp3-bytes'),
    })

    const form = page.getByRole('form', { name: 'Upload a recording' })
    await expect(form.getByRole('textbox', { name: 'Recording title' })).toHaveValue('week-3 enzymes')
    await expect(form.getByRole('combobox', { name: 'Recording course' })).toHaveValue('biology')
    await form.getByRole('textbox', { name: 'Recording title' }).fill('Enzymes – week 3')
    await form.getByRole('button', { name: 'Upload' }).click()

    await expect.poll(() => uploadHeaders['content-type']).toBe('audio/mpeg')
    // The upload makes the lecture and the server selects it on the board: the widget writes no scope.
    expect(uploadHeaders['x-workspace-id']).toBe('ws-in-lecture')
    expect(uploadHeaders['x-select-on-board']).toBe('1')
    expect(focused).toEqual([])
    expect(decodeURIComponent(uploadHeaders['x-recording-title'])).toBe('Enzymes – week 3')
    expect(uploadHeaders['x-recording-course']).toBe('biology')
    expect(uploadHeaders['x-lecture-id']).toBeUndefined()
  })

  test('uploading a file onto a selected lecture adds it there and asks for no course', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    let uploadHeaders: Record<string, string> = {}
    await page.route('**/upload', async (route) => {
      uploadHeaders = route.request().headers()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'rec-part-2', lectureId: 'lec-rec-bio-4' }) })
    })
    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={{ lectureId: 'lec-rec-bio-4', courseTag: 'biology' }} config={{}} />
      </AudioCaptureHarness>,
    )

    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Upload a recording' }).click()
    await (await chooser).setFiles({ name: 'part-2.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('ID3-fake-mp3-bytes') })

    const form = page.getByRole('form', { name: 'Upload a recording' })
    await expect(form.getByTestId('upload-into-lecture')).toHaveText('Adds to Biology Lecture: Mitochondrial DNA')
    await expect(form.getByRole('combobox', { name: 'Recording course' })).toHaveCount(0)
    await form.getByRole('button', { name: 'Upload' }).click()
    await expect.poll(() => uploadHeaders['x-lecture-id']).toBe('lec-rec-bio-4')
    expect(uploadHeaders['x-recording-course']).toBeUndefined()
  })

  test('rejects files that are not supported audio', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={{}} config={{}} />
      </AudioCaptureHarness>,
    )

    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Upload a recording' }).click()
    await (await chooser).setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })

    await expect(page.getByRole('alert')).toHaveText('Pick a webm, mp3, m4a, wav or ogg audio file')
    await expect(page.getByRole('form', { name: 'Upload a recording' })).toHaveCount(0)
  })
})
