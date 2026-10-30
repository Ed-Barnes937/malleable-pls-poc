import { test, expect, type APIRequestContext } from '@playwright/test'
import type { Lecture } from '../packages/substrate/src'
import { CalendarPom, PanelGridPom, SidebarPom, TopBarPom } from './pom'
import { trpcMutation, trpcQuery } from './api'
import { reseed } from './reseed'

/**
 * Boards select a lecture, not a recording (02 phase 2): each widget's
 * behaviour with and without a lecture selected, against the real server.
 *
 * - Record: "Ready to record <lecture>" and captures go into the selected
 *   lecture ("Record more" adds a part); New lecture clears the board lecture.
 * - Transcript: "No recording yet", the lecture's parts, and "Pick a lecture"
 *   with the course's latest lectures as one-click choices.
 * - Calendar, To-do, Coming up: highlight what came from the lecture.
 * - A moment from another course's lecture switches the board's course with
 *   its lecture (the strict rule), with a way back.
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

const monday = (() => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
})()
const at = (day: number, h: number, m = 0) =>
  new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day, h, m).toISOString()

// A real MediaRecorder on Chromium's fake microphone, for the Record tests.
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['microphone'],
})

test.describe('A board selects a lecture', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test.describe('recording', () => {
    test('Record goes into the selected lecture, Record more adds a part, New lecture clears it', async ({ page, request }) => {
      const ws = await board(request, 'In class', ['audio-capture', 'transcript'])
      const lecture = await trpcMutation<Lecture>(request, 'lectures.create', { course: 'biology', title: 'Enzymes', workspaceId: ws })

      await page.goto('/')
      const topBar = new TopBarPom(page)
      const grid = new PanelGridPom(page)
      await topBar.switchToWorkspace('In class')
      const audio = grid.panelByLabel('Audio Capture')
      const transcript = grid.panelByLabel('Transcript')

      // A lecture with no recording yet: both widgets say so, by its name.
      await expect(topBar.scopeChip).toHaveText('Showing: Biology · Enzymes', { timeout: 10000 })
      await expect(audio.getByTestId('ready-to-record')).toHaveText('Ready to record Enzymes')
      await expect(transcript.getByText('No recording yet')).toBeVisible()

      // Record: it goes into this lecture, which stays the board's lecture.
      await audio.getByRole('button', { name: 'Start recording' }).click()
      await expect(audio.getByText('REC')).toBeVisible()
      await expect(audio.getByText('0:02')).toBeVisible({ timeout: 10000 })
      await audio.getByRole('button', { name: 'Stop recording' }).click()
      await expect(transcript.getByText('Enzymes')).toBeVisible({ timeout: 10000 })
      await expect(transcript.getByText(/\d+ segments/)).toBeVisible({ timeout: 20000 })
      await expect(transcript.getByText('No recording yet')).toHaveCount(0)
      await expect(topBar.scopeChip).toHaveText('Showing: Biology · Enzymes')
      await expect.poll(async () => (await trpcQuery<Lecture>(request, 'lectures.byId', lecture.id)).recordings.length).toBe(1)

      // Record more: a second part of the same lecture.
      await audio.getByRole('button', { name: 'Record more' }).click()
      await expect(audio.getByText('REC')).toBeVisible()
      await expect(audio.getByText('0:02')).toBeVisible({ timeout: 10000 })
      await audio.getByRole('button', { name: 'Stop recording' }).click()
      const parts = transcript.getByRole('group', { name: 'Lecture parts' }).getByRole('button')
      await expect(parts).toHaveText(['Part 1', 'Part 2'], { timeout: 10000 })
      await expect(parts.nth(1)).toHaveAttribute('aria-pressed', 'true')
      expect((await trpcQuery<Lecture[]>(request, 'lectures.list', {})).filter((l) => l.title === 'Enzymes')).toHaveLength(1)

      // New lecture: the board has no lecture; the course stays.
      await audio.getByRole('button', { name: 'New lecture' }).click()
      await expect(topBar.scopeChip).toHaveText('Showing: Biology', { timeout: 10000 })
      await expect(audio.getByTestId('ready-to-record')).toHaveText('Ready to record')
      // The Transcript offers the course's latest lectures; one click selects one.
      const recent = transcript.getByRole('list', { name: 'Recent lectures' }).getByRole('button')
      await expect(recent.first()).toHaveText('Enzymes')
      await recent.first().click()
      await expect(topBar.scopeChip).toHaveText('Showing: Biology · Enzymes', { timeout: 10000 })
      await expect(parts).toHaveCount(2)
    })

    test('with no lecture selected, Record makes a new lecture in the board course and selects it', async ({ page, request }) => {
      await board(request, 'Lecture hall', ['audio-capture', 'transcript'], 'chemistry')
      await page.goto('/')
      const topBar = new TopBarPom(page)
      const grid = new PanelGridPom(page)
      await topBar.switchToWorkspace('Lecture hall')
      const audio = grid.panelByLabel('Audio Capture')
      const transcript = grid.panelByLabel('Transcript')
      await expect(topBar.scopeChip).toHaveText('Showing: Chemistry', { timeout: 10000 })
      await expect(audio.getByTestId('ready-to-record')).toHaveText('Ready to record')

      const before = (await trpcQuery<Lecture[]>(request, 'lectures.list', { courseTag: 'chemistry' })).map((l) => l.id)
      await audio.getByRole('button', { name: 'Start recording' }).click()
      await expect(audio.getByText('0:02')).toBeVisible({ timeout: 10000 })
      await audio.getByRole('button', { name: 'Stop recording' }).click()
      await expect(transcript.getByText(/\d+ segments/)).toBeVisible({ timeout: 20000 })

      const made = (await trpcQuery<Lecture[]>(request, 'lectures.list', { courseTag: 'chemistry' })).filter((l) => !before.includes(l.id))
      expect(made).toHaveLength(1)
      await expect(topBar.scopeChip).toHaveText(`Showing: Chemistry · ${made[0].title}`)
      await topBar.openDrawer()
      await expect(new SidebarPom(page).lectureSelect).toHaveValue(made[0].id)
    })
  })

  test('Calendar, To-do and Coming up highlight what came from the selected lecture, and only while one is', async ({ page, request }) => {
    const ws = await board(request, 'Plan and review', ['calendar', 'todo', 'coming-up'])
    const fromLecture = { course: 'biology', source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 540000 }
    await trpcMutation(request, 'planItems.create', { kind: 'task', title: 'Review: maternal inheritance', starts_at: at(3, 20), ends_at: at(3, 20, 30), duration_min: 30, ...fromLecture })
    await trpcMutation(request, 'planItems.create', { kind: 'task', title: 'Reread the lecture notes', duration_min: 30, ...fromLecture })
    await trpcMutation(request, 'planItems.create', { kind: 'deadline', title: 'Lecture quiz', due_at: at(4, 9), ...fromLecture })

    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    await topBar.switchToWorkspace('Plan and review')
    const calendar = new CalendarPom(page)
    const todoRow = grid.panelByLabel('To-do').getByTestId('todo-item').filter({ hasText: 'Reread the lecture notes' })
    const deadline = grid.panelByLabel('Coming up').getByTestId('coming-up-item').filter({ hasText: 'Lecture quiz' })
    const block = calendar.block('Review: maternal inheritance')

    // No lecture: nothing is ringed.
    await expect(block).toBeVisible({ timeout: 10000 })
    await expect(block).not.toHaveAttribute('data-linked')
    await expect(todoRow).not.toHaveAttribute('data-highlighted')
    await expect(deadline).not.toHaveAttribute('data-highlighted')

    // These widgets highlight the lecture, so the board offers the picker.
    await topBar.openDrawer()
    const sidebar = new SidebarPom(page)
    await sidebar.selectLecture('Biology Lecture: Mitochondrial DNA')
    await page.keyboard.press('Escape')
    await expect(topBar.scopeChip).toHaveText('Showing: Biology · Biology Lecture: Mitochondrial DNA', { timeout: 10000 })
    await expect(block).toHaveAttribute('data-linked', 'true')
    await expect(todoRow).toHaveAttribute('data-highlighted', 'true')
    await expect(deadline).toHaveAttribute('data-highlighted', 'true')

    // Another lecture: no longer theirs.
    await trpcMutation(request, 'workspaces.setBoardScope', { workspaceId: ws, lectureId: 'lec-rec-bio-3' })
    await page.reload()
    await topBar.switchToWorkspace('Plan and review')
    await expect(topBar.scopeChip).toHaveText('Showing: Biology · Biology Lecture: Mitochondria & Energy', { timeout: 10000 })
    await expect(block).not.toHaveAttribute('data-linked')
    await expect(todoRow).not.toHaveAttribute('data-highlighted')
    await expect(deadline).not.toHaveAttribute('data-highlighted')
  })

  test('"Go to moment" from another course selects that lecture and its course, with a way back', async ({ page, request }) => {
    const ws = await board(request, 'Biology review', ['calendar', 'transcript'])
    await trpcMutation(request, 'workspaces.setBoardScope', { workspaceId: ws, lectureId: 'lec-rec-bio-4' })
    // A Chemistry study block made from the SN1 moment (9:00) of the Chemistry lecture.
    await trpcMutation(request, 'planItems.create', {
      kind: 'task', title: 'Review: SN1 mechanism', starts_at: at(2, 20), ends_at: at(2, 20, 30), duration_min: 30,
      course: 'chemistry', source_type: 'recording', source_id: 'rec-chem-1', source_offset_ms: 540000,
    })

    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Biology review')
    const calendar = new CalendarPom(page)
    const transcript = new PanelGridPom(page).panelByLabel('Transcript')
    await expect(topBar.scopeChip).toHaveText('Showing: Biology · Biology Lecture: Mitochondrial DNA', { timeout: 10000 })
    await expect(transcript.getByText('Biology Lecture: Mitochondrial DNA')).toBeVisible()

    // The calendar highlights the course, so the Chemistry block is there (dimmed).
    await calendar.block('Review: SN1 mechanism').click()
    await calendar.popover.getByRole('button', { name: 'Go to moment' }).click()

    // One write: the Chemistry lecture, and with it Chemistry.
    await expect(topBar.scopeChip).toHaveText('Showing: Chemistry · Chemistry Lecture: Organic Reactions', { timeout: 10000 })
    const moment = transcript.locator('[data-moment]')
    await expect(moment).toContainText('SN1 is a two-step mechanism', { timeout: 10000 })
    expect(await trpcQuery(request, 'workspaces.scopes', ws)).toEqual([
      expect.objectContaining({ scope_type: 'lecture', scope_value: 'lec-rec-chem-1' }),
      expect.objectContaining({ scope_type: 'tag', scope_value: 'chemistry' }),
    ])

    // The toast says what changed and offers the lecture (and course) it showed.
    const toast = page.getByTestId('toast-host').getByTestId('toast')
    await expect(toast).toContainText('Opened 9:00 in Chemistry Lecture: Organic Reactions')
    await toast.getByRole('button', { name: 'Back to Biology Lecture: Mitochondrial DNA' }).click()
    await expect(topBar.scopeChip).toHaveText('Showing: Biology · Biology Lecture: Mitochondrial DNA', { timeout: 10000 })
  })

  test('"Go to moment" on a board with a course but no lecture offers the way back to the course', async ({ page, request }) => {
    await board(request, 'Biology week', ['calendar', 'transcript'], 'biology')
    await trpcMutation(request, 'planItems.create', {
      kind: 'task', title: 'Review: SN1 mechanism', starts_at: at(2, 20), ends_at: at(2, 20, 30), duration_min: 30,
      course: 'chemistry', source_type: 'recording', source_id: 'rec-chem-1', source_offset_ms: 540000,
    })

    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Biology week')
    const calendar = new CalendarPom(page)
    await expect(topBar.scopeChip).toHaveText('Showing: Biology', { timeout: 10000 })
    await calendar.block('Review: SN1 mechanism').click()
    await calendar.popover.getByRole('button', { name: 'Go to moment' }).click()

    await expect(topBar.scopeChip).toHaveText('Showing: Chemistry · Chemistry Lecture: Organic Reactions', { timeout: 10000 })
    const toast = page.getByTestId('toast-host').getByTestId('toast')
    await toast.getByRole('button', { name: 'Back to Biology' }).click()
    await expect(topBar.scopeChip).toHaveText('Showing: Biology', { timeout: 10000 })
  })
})
