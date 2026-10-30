import path from 'path'
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { AudioCapturePom, CreateWorkspaceDialogPom, PanelGridPom, TopBarPom } from './pom'
import { apiUrl } from './ports'
import { trpcMutation, trpcQuery } from './api'

const FIXTURE = path.join(__dirname, 'fixtures', 'lecture-tone.wav')

/**
 * Makes the app act as `userId` instead of the seeded demo account: the web
 * build is fixed to dev-user-1 (VITE_USER_ID), so every call to the API is
 * rewritten on the way out, including the event stream's connection params.
 */
async function actAs(page: Page, userId: string) {
  await page.route(`${apiUrl}/**`, async (route) => {
    const request = route.request()
    await route.continue({
      url: request.url().replaceAll('dev-user-1', userId),
      headers: { ...request.headers(), 'x-user-id': userId },
    })
  })
}

/** An empty "Lectures" board with Audio Capture and Transcript, as the account's first act. */
async function openCaptureBoard(page: Page) {
  await page.goto('/')
  const grid = new PanelGridPom(page)
  await new TopBarPom(page).openCreateWorkspaceDialog()
  await new CreateWorkspaceDialogPom(page).createWorkspace('Lectures')
  await grid.starter('Capture a lecture').click()
  await grid.expectPanelCount(2)
  return { audio: new AudioCapturePom(grid.panelByLabel('Audio Capture')), transcript: grid.panelByLabel('Transcript') }
}

interface Automation { id: string; trigger_event: string }
const automationsOf = (request: APIRequestContext, userId: string) =>
  trpcQuery<Automation[]>(request, 'workflows.forWorkspace', { workspaceId: 'none' }, userId)

test.describe('A brand-new account', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('uploads a lecture and gets its transcript and summary with no setup', async ({ page }) => {
    await actAs(page, `new-account-${Date.now()}`)
    const { audio, transcript } = await openCaptureBoard(page)
    await audio.pickFile(FIXTURE)
    await audio.submitUpload({ title: 'My first lecture', course: 'Biology' })

    await expect(transcript.getByText('My first lecture')).toBeVisible({ timeout: 10000 })
    await expect(transcript.getByRole('button', { name: /Today we're looking at mitochondrial DNA/ })).toBeVisible({ timeout: 20000 })
    await expect(transcript.getByText('6 segments')).toBeVisible()
    await expect(transcript.getByTestId('summary-line')).toBeVisible({ timeout: 20000 })
  })

  test('has the default automations once, and one it deletes stays deleted', async ({ page, request }) => {
    const user = `new-account-${Date.now()}-b`
    await actAs(page, user)
    await openCaptureBoard(page)

    const triggers = async () => (await automationsOf(request, user)).map((a) => a.trigger_event).sort()
    expect(await triggers()).toEqual(['recording:completed', 'recording:transcribed', 'tag:created'])

    const transcribe = (await automationsOf(request, user)).find((a) => a.trigger_event === 'recording:completed')!
    await trpcMutation(request, 'workflows.delete', { workflowId: transcribe.id }, user)
    await page.reload()
    await new PanelGridPom(page).expectPanelCount(2)
    expect(await triggers()).toEqual(['recording:transcribed', 'tag:created'])
  })

  test('a lecture nothing transcribed says so, and "Transcribe it" does it', async ({ page, request }) => {
    const user = `new-account-${Date.now()}-c`
    await actAs(page, user)
    const { audio, transcript } = await openCaptureBoard(page)
    const transcribe = (await automationsOf(request, user)).find((a) => a.trigger_event === 'recording:completed')!
    await trpcMutation(request, 'workflows.delete', { workflowId: transcribe.id }, user)

    await audio.pickFile(FIXTURE)
    await audio.submitUpload({ title: 'Untranscribed lecture', course: 'Biology' })

    await expect(transcript.getByText('Untranscribed lecture')).toBeVisible({ timeout: 10000 })
    await expect(transcript.getByTestId('untranscribed')).toHaveText("This lecture isn't transcribed yet.")
    await expect(transcript.getByText('0 segments')).toHaveCount(0)

    await transcript.getByRole('button', { name: 'Transcribe it' }).click()
    await expect(transcript.getByRole('button', { name: /Today we're looking at mitochondrial DNA/ })).toBeVisible({ timeout: 20000 })
    await expect(transcript.getByText('6 segments')).toBeVisible()
    await expect(transcript.getByTestId('untranscribed')).toHaveCount(0)
    // The rest of the chain still runs from the manual transcription.
    await expect(transcript.getByTestId('summary-line')).toBeVisible({ timeout: 20000 })
  })
})
