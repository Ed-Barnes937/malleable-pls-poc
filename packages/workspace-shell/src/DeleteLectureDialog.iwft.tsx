import type { Page } from '@playwright/test'
import { test, expect } from '../../../playwright/fixtures'
import { BoardScopeHarness } from '../../../playwright/board-scope-harness'
import { seedPlanItem } from '../../../playwright/plan-items'
import type { BackendSimulator } from '../../../playwright/backend-simulator'

// Deleting the board's lecture from the header (simulator board In Lecture).

const group = (page: Page) => page.getByRole('group', { name: 'What this board shows' })
const lecturePill = (page: Page) => page.getByTestId('scope-lecture').getByTestId('scope-pill-text')
/** Opens the lecture's menu; `deleteButton(page).click()` then chooses Delete. */
const deleteButton = (page: Page) => ({
  click: async () => {
    await group(page).getByRole('button', { name: 'Lecture options' }).click()
    await page.getByRole('menuitem', { name: 'Delete this lecture...' }).click()
  },
})
const dialog = (page: Page) => page.getByRole('dialog')
const list = (page: Page) => page.getByTestId('delete-lecture-list')

/** A lecture of `recordings` parts selected on In Lecture, with plan items made from its first part's moments. */
function seedLecture(simulator: BackendSimulator, { recordings = 1, reviews = 0, finished = 0 } = {}) {
  const lectureId = 'lec-photosynthesis'
  for (let part = 0; part < recordings; part++) {
    simulator.db.addRecording(
      { id: `rec-photo-${part}`, title: 'Photosynthesis', created_at: `2026-04-20T10:0${part}:00Z`, duration: 32 * 60000, audio_url: null, status: 'ready' },
      { lectureId, course: 'biology' },
    )
  }
  if (recordings === 0) {
    simulator.db.lectures.push({
      id: lectureId, title: 'Photosynthesis', course: 'biology', starts_at: '2030-11-12T10:00:00Z',
      class_item_id: null, class_date: null, created_at: '2026-04-20T10:00:00Z', updated_at: '2026-04-20T10:00:00Z',
    })
  }
  const review = (i: number, status: 'open' | 'done') => seedPlanItem(simulator, {
    id: `review-${status}-${i}`, kind: 'task', title: `Review: light reactions ${i + 1}`, status, course: 'biology',
    // Far ahead and fixed, so the label never reads "Today" or "Tomorrow".
    starts_at: `2030-11-1${i}T14:00:00Z`, ends_at: `2030-11-1${i}T14:30:00Z`,
    source_type: 'recording', source_id: 'rec-photo-0', source_offset_ms: i * 1000,
  })
  for (let i = 0; i < reviews; i++) review(i, 'open')
  for (let i = 0; i < finished; i++) review(i, 'done')
  const scope = simulator.db.workspaceScopes.find((s) => s.workspace_id === 'ws-in-lecture' && s.scope_type === 'lecture')!
  scope.scope_value = lectureId
  return lectureId
}

test('lists only what the lecture has, plan items by title and time, and focuses Cancel', async ({ mount, page, simulator }) => {
  seedLecture(simulator, { recordings: 2, reviews: 7, finished: 2 })
  simulator.db.tags.push({ id: 'tag-mark', target_type: 'recording', target_id: 'rec-photo-1', label: 'important', created_at: '2026-04-20T11:00:00Z' })
  await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
  await expect(lecturePill(page)).toHaveText('Photosynthesis')

  await deleteButton(page).click()
  await expect(dialog(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Delete "Photosynthesis"?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused()
  const items = list(page).locator(':scope > ul > li')
  await expect(items).toHaveText([
    '2 recordings (1h 04m) and their transcripts',
    '1 mark or note on the transcript',
    /^7 items made from its moments \(2 finished ones stay\):/,
  ])
  // The first five by title and time, then a count. No resources line.
  const named = items.nth(2).locator('li')
  await expect(named).toHaveText([
    'Review: light reactions 1 (Sun 10 Nov 14:00)',
    'Review: light reactions 2 (Mon 11 Nov 14:00)',
    'Review: light reactions 3 (Tue 12 Nov 14:00)',
    'Review: light reactions 4 (Wed 13 Nov 14:00)',
    'Review: light reactions 5 (Thu 14 Nov 14:00)',
    'and 2 more',
  ])

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog(page)).toHaveCount(0)
  // Back where it came from, for the keyboard.
  await expect(group(page).getByRole('button', { name: 'Lecture options' })).toBeFocused()
  expect(simulator.db.lectures.some((l) => l.id === 'lec-photosynthesis')).toBe(true)
})

test('deleting clears the board lecture, keeps finished items and names it in a toast', async ({ mount, page, simulator }) => {
  seedLecture(simulator, { reviews: 1, finished: 1 })
  await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
  await deleteButton(page).click()
  await dialog(page).getByRole('button', { name: 'Delete lecture' }).click()

  await expect(dialog(page)).toHaveCount(0)
  await expect(lecturePill(page)).toHaveText('No lecture')
  await expect(page.getByTestId('toast')).toHaveText('Deleted Photosynthesis')
  expect(simulator.db.lectures.some((l) => l.id === 'lec-photosynthesis')).toBe(false)
  expect(simulator.db.planItems.map((p) => p.id).filter((id) => id.startsWith('review-'))).toEqual(['review-done-0'])
  expect(simulator.db.planItems.find((p) => p.id === 'review-done-0')).toMatchObject({ source_type: null, source_id: null })
  // The board keeps its course.
  expect(simulator.db.workspaceScopes.filter((s) => s.workspace_id === 'ws-in-lecture').map((s) => s.scope_value)).toEqual(['biology'])
})

test('a lecture changed since the list was shown is listed again, and only then deleted', async ({ mount, page, simulator }) => {
  seedLecture(simulator, { reviews: 1 })
  await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
  await deleteButton(page).click()
  await expect(list(page)).toContainText('1 item made from its moments')

  // A study block is made from one of its moments meanwhile.
  seedPlanItem(simulator, {
    id: 'review-late', kind: 'task', title: 'Review: dark reactions', course: 'biology',
    source_type: 'recording', source_id: 'rec-photo-0', source_offset_ms: 9000,
  })
  await dialog(page).getByRole('button', { name: 'Delete lecture' }).click()
  await expect(dialog(page).getByRole('alert')).toHaveText('Something was added to this lecture since. Check the list again.')
  await expect(list(page)).toContainText('2 items made from its moments')
  await expect(list(page)).toContainText('Review: dark reactions (Not scheduled)')
  expect(simulator.db.lectures.some((l) => l.id === 'lec-photosynthesis')).toBe(true)

  await dialog(page).getByRole('button', { name: 'Delete lecture' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(lecturePill(page)).toHaveText('No lecture')
  expect(simulator.db.planItems.some((p) => p.id === 'review-late')).toBe(false)
})

test('an empty lecture is deleted at once, with no dialog', async ({ mount, page, simulator }) => {
  seedLecture(simulator, { recordings: 0 })
  await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
  await expect(lecturePill(page)).toHaveText('Photosynthesis')
  await deleteButton(page).click()

  await expect(lecturePill(page)).toHaveText('No lecture')
  await expect(page.getByTestId('toast')).toHaveText('Deleted Photosynthesis')
  await expect(dialog(page)).toHaveCount(0)
  expect(simulator.db.lectures.some((l) => l.id === 'lec-photosynthesis')).toBe(false)
  // The menu went with the lecture: focus is on the pill, not lost.
  await expect(group(page).getByRole('combobox', { name: 'Lecture' })).toBeFocused()
})

test('once Delete is pressed the dialog stays until the answer: no Cancel, Escape or backdrop', async ({ mount, page, simulator }) => {
  seedLecture(simulator, { reviews: 1 })
  await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  let sent!: () => void
  const arrived = new Promise<void>((resolve) => { sent = resolve })
  await page.route((url) => url.pathname.split(/[/,]/).includes('lectures.delete'), async (route) => {
    sent()
    await held
    await route.fallback()
  })
  await deleteButton(page).click()
  await dialog(page).getByRole('button', { name: 'Delete lecture' }).click()
  await arrived

  await expect(dialog(page).getByRole('button', { name: 'Deleting...' })).toBeDisabled()
  await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.getByTestId('dialog-backdrop').click({ position: { x: 5, y: 5 } })
  await dialog(page).getByRole('button', { name: 'Close' }).click()
  await expect(dialog(page)).toBeVisible()
  expect(simulator.db.lectures.some((l) => l.id === 'lec-photosynthesis')).toBe(true)

  release()
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByTestId('toast')).toHaveText('Deleted Photosynthesis')
  await expect(lecturePill(page)).toHaveText('No lecture')
  await expect(group(page).getByRole('combobox', { name: 'Lecture' })).toBeFocused()
})

test('on a phone the dialog fits the screen and its buttons stay in reach', async ({ mount, page, simulator }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  seedLecture(simulator, { recordings: 3, reviews: 5 })
  await mount(<BoardScopeHarness workspaceId="ws-in-lecture" compact />)
  await deleteButton(page).click()
  const box = (await dialog(page).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(360)
  expect(box.y + box.height).toBeLessThanOrEqual(640)
  await expect(dialog(page).getByRole('button', { name: 'Delete lecture' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})
