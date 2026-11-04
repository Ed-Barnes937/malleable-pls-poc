import { test, expect, type APIRequestContext } from '@playwright/test'
import type { Lecture, PlanItem, Recording } from '../packages/substrate/src'
import { localDate } from '../packages/substrate/src/class-occurrences'
import { startOfLocalDay } from '../packages/scheduler/src'
import { PanelGridPom, TopBarPom } from './pom'
import { deleteClassesOf, trpcMutation, trpcQuery } from './api'
import { apiUrl } from './ports'
import { reseed } from './reseed'
import { SEED_TIME_ZONE } from './seed-week'

/**
 * Deleting a lecture from the header's lecture pill (06), against the real
 * server: everything recorded into it goes, files on disk included, behind
 * a confirm step that names what will go; an empty lecture goes at once.
 */

async function board(request: APIRequestContext, name: string, lensTypes: string[], courseTag?: string): Promise<string> {
  const ws = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name, courseTag })
  let x = 24
  for (const lensType of lensTypes) {
    await trpcMutation(request, 'workspaces.addPanel', { workspaceId: ws.id, lensType, slotName: lensType, pos_x: x, pos_y: 24, width: 420, height: 560 })
    x += 444
  }
  return ws.id
}

async function boardLecture(request: APIRequestContext, workspaceId: string): Promise<string | undefined> {
  const scopes = await trpcQuery<{ scope_type: string; scope_value: string }[]>(request, 'workspaces.scopes', workspaceId)
  return scopes.find((s) => s.scope_type === 'lecture')?.scope_value
}

const AT_LEAST_2S = /^(0:0[2-9]|0:[1-5]\d|[1-9]\d*:\d\d)$/

test.use({
  viewport: { width: 1440, height: 900 },
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['microphone'],
})

test.describe('Deleting a lecture', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('a recorded lecture with a study block: the confirm step names them, then all of it goes', async ({ page, request }) => {
    // No class on, whatever the time: Record makes a fresh Chemistry lecture.
    await deleteClassesOf(request, 'chemistry')
    const ws = await board(request, 'Lecture hall', ['audio-capture', 'transcript', 'todo'], 'chemistry')
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Lecture hall')
    const audio = grid.panelByLabel('Audio Capture')
    const transcript = grid.panelByLabel('Transcript')
    const todo = grid.panelByLabel('To-do')
    await topBar.expectScope('Chemistry', null, { timeout: 10000 })

    // Record a short lecture.
    await audio.getByRole('button', { name: 'Start recording' }).click()
    await expect(audio.getByTestId('capture-timer')).toHaveText(AT_LEAST_2S, { timeout: 10000 })
    await audio.getByRole('button', { name: 'Stop recording' }).click()
    await expect(transcript.getByText(/\d+ segments/)).toBeVisible({ timeout: 20000 })
    const lectureId = (await boardLecture(request, ws))!
    const lecture = await trpcQuery<Lecture>(request, 'lectures.byId', lectureId)
    const recording = await trpcQuery<Recording>(request, 'recordings.byId', lecture.recordings[0].id)
    expect(recording.audio_url).toMatch(/^\/uploads\//)
    const audioUrl = `${apiUrl}${recording.audio_url}`
    expect((await request.get(audioUrl)).status()).toBe(200)
    // The summary automation writes its note once the transcript is in: wait
    // for it, so the confirm step's list can't change under the test.
    await expect(transcript.getByRole('region', { name: 'Lecture summary' }).getByTestId('summary-line')).toBeVisible({ timeout: 20000 })

    // Mark a moment confusing: the review automation adds a study block.
    await transcript.locator('[data-segment-id]').first().click()
    await transcript.getByRole('button', { name: 'confused', exact: true }).click()
    const fromIt = { sourceType: 'recording', sourceId: recording.id }
    await expect.poll(async () => (await trpcQuery<PlanItem[]>(request, 'planItems.list', fromIt)).length, { timeout: 20000 }).toBe(1)
    const [review] = await trpcQuery<PlanItem[]>(request, 'planItems.list', fromIt)
    const reviewRow = todo.getByTestId('todo-item').filter({ hasText: review.title })
    await expect(reviewRow).toBeVisible({ timeout: 10000 })

    // The confirm step names the recording and the study block.
    await topBar.chooseLectureAction('Delete this lecture...')
    const dialog = page.getByRole('dialog', { name: `Delete "${lecture.title}"?` })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await expect(dialog).toContainText(/1 recording \(\d+s\) and its transcript/)
    // The confused tag and the summary.
    await expect(dialog).toContainText('2 marks and notes on the transcript')
    await expect(dialog).toContainText('1 item made from its moments')
    await expect(dialog).toContainText(review.title)
    await dialog.getByRole('button', { name: 'Delete lecture' }).click()

    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('toast').filter({ hasText: 'Deleted' })).toHaveText(`Deleted ${lecture.title}`)
    await topBar.expectScope('Chemistry', null)
    await expect(reviewRow).toHaveCount(0)
    await expect(audio.getByTestId('ready-to-record')).toHaveText('Ready to record')
    expect((await request.get(audioUrl)).status()).toBe(404)
    expect(await trpcQuery<Lecture | null>(request, 'lectures.byId', lectureId)).toBeNull()
    expect((await trpcQuery<PlanItem[]>(request, 'planItems.list', {})).some((p) => p.id === review.id)).toBe(false)

    // And it stays that way after a reload.
    await page.reload()
    await topBar.switchToWorkspace('Lecture hall')
    await topBar.expectScope('Chemistry', null, { timeout: 10000 })
    await expect(todo.getByTestId('todo-item').filter({ hasText: review.title })).toHaveCount(0)
  })

  test("an empty lecture from a future class goes at once, and opening the class again makes a new one", async ({ page, request }) => {
    // A Physics class in three days, its lecture opened (as the Calendar does) on a Physics board.
    const at = startOfLocalDay(Date.now(), SEED_TIME_ZONE, 3) + 10 * 3_600_000
    const physicsClass = await trpcMutation<{ id: string }>(request, 'planItems.create', {
      kind: 'commitment', title: 'Physics lecture', subtype: 'class', course: 'physics',
      starts_at: new Date(at).toISOString(), ends_at: new Date(at + 3_600_000).toISOString(),
    })
    const date = localDate(at, SEED_TIME_ZONE)
    const ws = await board(request, 'Physics class', ['audio-capture', 'transcript'], 'physics')
    const opened = await trpcMutation<{ lecture: Lecture; created: boolean }>(request, 'lectures.forClassOccurrence', {
      planItemId: physicsClass.id, date, workspaceId: ws, timeZone: SEED_TIME_ZONE,
    })
    expect(opened.created).toBe(true)

    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Physics class')
    await topBar.expectScope('Physics', opened.lecture.title, { timeout: 10000 })
    await topBar.chooseLectureAction('Delete this lecture...')

    await expect(page.getByTestId('toast')).toHaveText(`Deleted ${opened.lecture.title}`)
    await topBar.expectScope('Physics', null)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await trpcQuery<Lecture | null>(request, 'lectures.byId', opened.lecture.id)).toBeNull()
    // The class stays, and opening it again makes a fresh lecture.
    expect((await trpcQuery<PlanItem[]>(request, 'planItems.list', {})).some((p) => p.id === physicsClass.id)).toBe(true)
    const again = await trpcMutation<{ lecture: Lecture; created: boolean }>(request, 'lectures.forClassOccurrence', {
      planItemId: physicsClass.id, date, timeZone: SEED_TIME_ZONE,
    })
    expect(again.created).toBe(true)
    expect(again.lecture.id).not.toBe(opened.lecture.id)
  })

  test('on a phone the confirm step fits, its buttons in reach, with no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('In Lecture')
    await topBar.expectScope('Biology', 'Biology Lecture: Mitochondrial DNA', { timeout: 10000 })
    await topBar.chooseLectureAction('Delete this lecture...')

    const dialog = page.getByRole('dialog', { name: 'Delete "Biology Lecture: Mitochondrial DNA"?' })
    await expect(dialog).toContainText('1 recording')
    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(360)
    expect(box.y + box.height).toBeLessThanOrEqual(640)
    await expect(dialog.getByRole('button', { name: 'Delete lecture' })).toBeInViewport()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await topBar.expectScope('Biology', 'Biology Lecture: Mitochondrial DNA')
  })
})
