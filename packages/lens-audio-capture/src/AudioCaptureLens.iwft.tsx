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
        <AudioCaptureLens panelId="test" scope={{ lectureId: 'lec-rec-bio-4', courseTag: 'biology' }} config={{}} onScopeChange={(p) => patches.push(p)} />
      </AudioCaptureHarness>,
    )

    await expect(page.getByText('Biology Lecture: Mitochondrial DNA')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Record more' })).toBeVisible()
    await page.getByRole('button', { name: 'New lecture' }).click()
    // One patch, clearing the lecture (the course stays).
    expect(patches).toEqual([{ lectureId: undefined }])
    await expect(page.getByText('Ready to record')).toBeVisible()
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
        <AudioCaptureLens panelId="test" scope={{ lectureId: 'lec-empty', courseTag: 'biology' }} config={{}} onScopeChange={(p) => selected.push(p.lectureId)} />
      </AudioCaptureHarness>,
    )

    await expect(page.getByTestId('ready-to-record')).toHaveText('Ready to record Biology lecture 30 Oct, 10:04')
    await page.getByRole('button', { name: 'Start recording' }).click()
    await expect(page.getByText('REC')).toBeVisible()
    await page.getByRole('button', { name: 'Stop recording' }).click()
    // Into the selected lecture: no new lecture, so no course header.
    await expect.poll(() => uploadHeaders['x-lecture-id']).toBe('lec-empty')
    expect(uploadHeaders['x-recording-course']).toBeUndefined()
    await expect.poll(() => selected).toEqual(['lec-empty'])
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

  test('shows error when upload fails', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    await page.route('**/upload', async (route) => {
      await route.fulfill({ status: 500, body: 'Internal Server Error' })
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
  })

  test('uploading a file with no lecture selected asks for a title and course, then selects its new lecture', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    let uploadHeaders: Record<string, string> = {}
    await page.route('**/upload', async (route) => {
      uploadHeaders = route.request().headers()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'rec-uploaded-1', lectureId: 'lec-uploaded-1' }),
      })
    })
    const focused: Array<string | undefined> = []

    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens
          panelId="test"
          scope={{ courseTag: 'biology' }}
          config={{}}
          onScopeChange={(patch) => focused.push(patch.lectureId)}
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

    await expect.poll(() => focused).toEqual(['lec-uploaded-1'])
    expect(uploadHeaders['content-type']).toBe('audio/mpeg')
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
