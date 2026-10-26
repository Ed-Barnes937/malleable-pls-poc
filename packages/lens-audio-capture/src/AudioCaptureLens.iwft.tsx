import { test, expect } from '../../../playwright/fixtures'
import { AudioCaptureHarness } from '../../../playwright/audio-capture-harness'
import AudioCaptureLens from './AudioCaptureLens'

const MEDIA_RECORDER_MOCK = `
  class MockMediaRecorder {
    constructor() {
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

  test('shows complete state when recording is in scope', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={{ recordingId: 'rec-bio-4' }} config={{}} />
      </AudioCaptureHarness>,
    )

    await expect(page.getByText('Biology Lecture: Mitochondrial DNA')).toBeVisible()
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
  })

  test('stopping recording uploads and transitions to complete', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    await page.route('**/upload', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'rec-new-1', title: 'New Recording' }),
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

  test('uploading a file asks for a title and course, then focuses the new recording', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    let uploadHeaders: Record<string, string> = {}
    await page.route('**/upload', async (route) => {
      uploadHeaders = route.request().headers()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'rec-uploaded-1' }),
      })
    })
    const focused: Array<string | undefined> = []

    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens
          panelId="test"
          scope={{ courseTag: 'biology' }}
          config={{}}
          onScopeChange={(patch) => focused.push(patch.recordingId)}
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

    await expect.poll(() => focused).toEqual(['rec-uploaded-1'])
    expect(uploadHeaders['content-type']).toBe('audio/mpeg')
    expect(decodeURIComponent(uploadHeaders['x-recording-title'])).toBe('Enzymes – week 3')
    expect(uploadHeaders['x-recording-course']).toBe('biology')
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
