import { test, expect, type APIRequestContext } from '@playwright/test'
import type { Lecture } from '../packages/substrate/src'
import { CalendarPom, PanelGridPom, TopBarPom } from './pom'
import { deleteClassesOf, trpcMutation, trpcQuery } from './api'
import { reseed } from './reseed'
import { SEED_TIME_ZONE } from './seed-week'
import { startOfLocalDay } from '../packages/scheduler/src'

/**
 * A lecture exists from the moment Record is pressed (02 phase 3, D7), and
 * Record during a class lands on that class occurrence's lecture (D8),
 * against the real server and Chromium's fake microphone:
 *
 * - the server makes and selects the lecture as capture starts, so the
 *   header and the Transcript ("Recording...") show it before any audio;
 * - during a class of the board's course, the lecture is that occurrence's
 *   (named from the class) and the Calendar rings the class;
 * - the client never writes the board's scope itself.
 */

async function board(request: APIRequestContext, name: string, lensTypes: string[], courseTag?: string): Promise<string> {
  const ws = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name, courseTag })
  let x = 24
  for (const lensType of lensTypes) {
    const width = lensType === 'calendar' ? 900 : 420
    await trpcMutation(request, 'workspaces.addPanel', { workspaceId: ws.id, lensType, slotName: lensType, pos_x: x, pos_y: 24, width, height: 560 })
    x += width + 24
  }
  return ws.id
}

const AT_LEAST_2S = /^(0:0[2-9]|0:[1-5]\d|[1-9]\d*:\d\d)$/

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['microphone'],
})

test.describe('Record makes its lecture as it starts', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('Record during a class: the class lecture is selected at once, the Transcript says Recording..., the Calendar rings the class', async ({ page, request }) => {
    // A Physics class on right now (one-off, so it is on whatever the day;
    // no earlier than today's midnight, so it is in this week's Calendar
    // even just after midnight on a Monday).
    const now = Date.now()
    const physicsClass = await trpcMutation<{ id: string }>(request, 'planItems.create', {
      kind: 'commitment', title: 'Physics lecture', subtype: 'class', course: 'physics',
      starts_at: new Date(Math.max(now - 30 * 60_000, startOfLocalDay(now, SEED_TIME_ZONE))).toISOString(),
      ends_at: new Date(now + 60 * 60_000).toISOString(),
    })
    const ws = await board(request, 'Physics class', ['audio-capture', 'transcript', 'calendar'], 'physics')

    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Physics class')
    const audio = grid.panelByLabel('Audio Capture')
    const transcript = grid.panelByLabel('Transcript')
    const classBlock = new CalendarPom(page).block('Physics lecture')
    await topBar.expectScope('Physics', null, { timeout: 10000 })
    await expect(classBlock).toBeVisible()
    await expect(classBlock).not.toHaveAttribute('data-linked')

    const scopeWrites: string[] = []
    page.on('request', (req) => { if (req.url().includes('workspaces.setBoardScope')) scopeWrites.push(req.url()) })

    await audio.getByRole('button', { name: 'Start recording' }).click()
    await expect(audio.getByText('REC')).toBeVisible()

    // Before any audio: the class's lecture, selected on the board by the server.
    await expect.poll(async () => (await trpcQuery<{ scope_type: string; scope_value: string }[]>(request, 'workspaces.scopes', ws))
      .find((s) => s.scope_type === 'lecture')?.scope_value, { timeout: 10000 }).toBeTruthy()
    const scopes = await trpcQuery<{ scope_type: string; scope_value: string }[]>(request, 'workspaces.scopes', ws)
    const lectureId = scopes.find((s) => s.scope_type === 'lecture')!.scope_value
    const lecture = await trpcQuery<Lecture>(request, 'lectures.byId', lectureId)
    expect(lecture).toMatchObject({ class_item_id: physicsClass.id, course: 'physics', recordings: [] })
    expect(lecture.title).toMatch(/^Physics lecture · \w{3} \d{1,2} \w{3}$/)

    await topBar.expectScope('Physics', lecture.title, { timeout: 10000 })
    await expect(audio.getByTestId('recording-into')).toHaveText(lecture.title)
    await expect(transcript.getByTestId('lecture-title')).toHaveText(lecture.title)
    await expect(transcript.getByTestId('recording-live')).toHaveText('Recording...')
    await expect(classBlock).toHaveAttribute('data-linked', 'true')

    await expect(audio.getByTestId('capture-timer')).toHaveText(AT_LEAST_2S, { timeout: 10000 })
    await audio.getByRole('button', { name: 'Stop recording' }).click()
    await expect(transcript.getByText(/\d+ segments/)).toBeVisible({ timeout: 20000 })
    await expect(transcript.getByTestId('recording-live')).toHaveCount(0)

    // The audio is in the class lecture, the only one made; the board still shows it.
    await expect.poll(async () => (await trpcQuery<Lecture>(request, 'lectures.byId', lectureId)).recordings).toHaveLength(1)
    await expect.poll(async () => (await trpcQuery<Lecture[]>(request, 'lectures.list', { courseTag: 'physics' })).filter((l) => l.class_item_id === physicsClass.id)).toHaveLength(1)
    await topBar.expectScope('Physics', lecture.title)
    expect(scopeWrites).toEqual([])

    // And it survives a reload.
    await page.reload()
    await topBar.switchToWorkspace('Physics class')
    await topBar.expectScope('Physics', lecture.title, { timeout: 10000 })
    await expect(transcript.getByTestId('lecture-title')).toHaveText(lecture.title)
  })

  test('Record outside any class makes a fresh lecture, selected before the audio lands', async ({ page, request }) => {
    // The seeded week has a weekly Chemistry class: without it no class is
    // on, whatever the time of day.
    await deleteClassesOf(request, 'chemistry')
    const ws = await board(request, 'Lecture hall', ['audio-capture', 'transcript'], 'chemistry')
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Lecture hall')
    const audio = grid.panelByLabel('Audio Capture')
    const transcript = grid.panelByLabel('Transcript')
    await topBar.expectScope('Chemistry', null, { timeout: 10000 })

    await audio.getByRole('button', { name: 'Start recording' }).click()
    await expect(transcript.getByTestId('recording-live')).toHaveText('Recording...', { timeout: 10000 })
    await expect.poll(async () => (await trpcQuery<{ scope_type: string; scope_value: string }[]>(request, 'workspaces.scopes', ws)).some((s) => s.scope_type === 'lecture')).toBe(true)
    const scopes = await trpcQuery<{ scope_type: string; scope_value: string }[]>(request, 'workspaces.scopes', ws)
    const lecture = await trpcQuery<Lecture>(request, 'lectures.byId', scopes.find((s) => s.scope_type === 'lecture')!.scope_value)
    expect(lecture).toMatchObject({ course: 'chemistry', class_item_id: null })
    expect(lecture.title).toMatch(/^Chemistry lecture \d{1,2} \w{3}, \d\d:\d\d$/)
    await topBar.expectScope('Chemistry', lecture.title)

    await expect(audio.getByTestId('capture-timer')).toHaveText(AT_LEAST_2S, { timeout: 10000 })
    await audio.getByRole('button', { name: 'Stop recording' }).click()
    await expect(transcript.getByText(/\d+ segments/)).toBeVisible({ timeout: 20000 })
    expect((await trpcQuery<Lecture>(request, 'lectures.byId', lecture.id)).recordings).toHaveLength(1)
  })
})
