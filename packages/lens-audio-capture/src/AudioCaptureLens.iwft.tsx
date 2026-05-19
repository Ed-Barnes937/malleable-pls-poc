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

  test('shows complete state when recording exists in scope', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={{ recordingId: 'rec-bio-4' }} config={{}} />
      </AudioCaptureHarness>,
    )

    await expect(page.getByText('Biology Lecture: Mitochondrial DNA')).toBeVisible()
  })

  test('shows complete state when recording exists in config', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={{}} config={{ recordingId: 'rec-bio-4' }} />
      </AudioCaptureHarness>,
    )

    await expect(page.getByText('Biology Lecture: Mitochondrial DNA')).toBeVisible()
  })

  test('scope recordingId takes priority over config', async ({ mount, page, simulator }) => {
    await injectMocks(page)
    await mount(
      <AudioCaptureHarness>
        <AudioCaptureLens panelId="test" scope={{ recordingId: 'rec-chem-1' }} config={{ recordingId: 'rec-bio-4' }} />
      </AudioCaptureHarness>,
    )

    await expect(page.getByText('Chemistry Lecture: Organic Reactions')).toBeVisible()
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
})
