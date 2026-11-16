import { test, expect } from './test'
import type { APIRequestContext, Page } from '@playwright/test'
import type { Lecture, LectureDeletePreview } from '../packages/substrate/src'
import type { PlanItem } from '../packages/substrate/src/types'
import { CalendarPom, PanelGridPom, TopBarPom } from './pom'
import { trpcMutation, trpcQuery } from './api'
import { reseed } from './reseed'

/**
 * A student's own courses (spec 11, section 4): made from the board's
 * course pill, used by a to-do and a calendar class, then renamed, archived,
 * restored and deleted from the Courses dialog. Every change shows without a
 * reload wherever the course is shown.
 *
 * Boards are set up through the API (as the shell's drop handler does); the
 * rest is done as a student would. Clock-independent: the calendar is used
 * only at 06:00 at the weekend, which the seeded week leaves clear.
 */

async function createBoard(request: APIRequestContext, name: string, lensTypes: string[]) {
  const board = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name })
  for (const [i, lensType] of lensTypes.entries()) {
    await trpcMutation(request, 'workspaces.addPanel', {
      workspaceId: board.id, lensType, slotName: `slot-${lensType}`,
      pos_x: 24 + i * 420, pos_y: 24, width: lensType === 'calendar' ? 760 : 400, height: 560, z_index: i + 1,
    })
  }
  return board
}

/** Waits for the next answer from `procedure` and checks it succeeded. */
function answered(page: Page, procedure: string) {
  const response = page.waitForResponse((r) => r.url().includes(procedure) && r.request().method() === 'POST')
  return async () => expect((await response).ok()).toBe(true)
}

test.describe('Courses', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('a student makes a course, uses it, renames, archives, restores and deletes it', async ({ page, request }) => {
    await createBoard(request, 'History week', ['todo', 'calendar'])
    await createBoard(request, 'Everything', ['todo'])
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)
    const calendar = new CalendarPom(page)
    await topBar.switchToWorkspace('History week')
    await topBar.expectActiveWorkspace('History week')
    await expect(topBar.coursePill).toHaveText('All courses')

    // 1. Header course pill -> "New course..." -> History: the board is on it, in a new colour.
    await topBar.courseSelect.selectOption({ label: 'New course...' })
    const newCourse = page.getByRole('dialog', { name: 'New course' })
    await newCourse.getByRole('textbox', { name: 'Name' }).fill('History')
    const created = answered(page, 'courses.create')
    const scoped = answered(page, 'workspaces.setBoardScope')
    await newCourse.getByRole('button', { name: 'Add course' }).click()
    await created()
    await scoped()
    await expect(newCourse).toHaveCount(0)
    await expect(topBar.coursePill).toHaveText('History')
    const dot = topBar.scopeGroup.getByTestId('scope-course').getByTestId('scope-pill-dot')
    await expect(dot).toHaveClass(/bg-course-amber/)
    await expect(dot).not.toHaveClass(/bg-course-(green|blue|purple)\b/)

    // 2. A to-do on this board is filed under History...
    const todo = grid.panelByLabel('To-do')
    await todo.getByRole('textbox', { name: 'New to-do' }).fill('Read about the Tudors')
    await todo.getByRole('button', { name: 'Add to-do' }).click()
    await expect(todo.getByTestId('todo-item').filter({ hasText: 'Read about the Tudors' })).toBeVisible()
    // ...and a class with course History draws as a class, not a shift.
    await calendar.showHours(6, 7)
    await calendar.clickAt(6, 6.1)
    await calendar.popover.getByLabel('Title').fill('Tudor seminar')
    await calendar.popover.getByLabel('Course', { exact: true }).selectOption({ label: 'History' })
    await calendar.popover.getByRole('button', { name: 'Add' }).click()
    const seminar = calendar.block('Tudor seminar')
    await expect(seminar).toHaveAttribute('data-look', 'class')
    // On a board of every course, the to-do wears a History pill in its colour.
    await topBar.switchToWorkspace('Everything')
    const everythingRow = grid.panelByLabel('To-do').getByTestId('todo-item').filter({ hasText: 'Read about the Tudors' })
    const todoCourse = everythingRow.getByText('History', { exact: true })
    await expect(todoCourse).toBeVisible()
    await expect(todoCourse).toHaveClass(/bg-course-amber-tint/)

    // 3. "Edit courses..." -> rename: the pill, the to-do and the class popover follow, without a reload.
    await topBar.switchToWorkspace('History week')
    await expect(topBar.coursePill).toHaveText('History')
    await topBar.courseSelect.selectOption({ label: 'Edit courses...' })
    const courses = page.getByRole('dialog', { name: 'Courses' })
    const name = courses.getByRole('textbox', { name: 'Name of History' })
    await name.fill('Modern History')
    const renamed = answered(page, 'courses.update')
    await name.press('Enter')
    await renamed()
    await courses.getByRole('button', { name: 'Done' }).click()
    await expect(topBar.coursePill).toHaveText('Modern History')
    await seminar.click()
    await expect(calendar.popover.getByLabel('Course', { exact: true }).locator('option:checked')).toHaveText('Modern History')
    await page.keyboard.press('Escape')
    await expect(calendar.popover).toHaveCount(0)
    await topBar.switchToWorkspace('Everything')
    await expect(everythingRow.getByText('Modern History', { exact: true })).toBeVisible()
    await page.reload()
    await topBar.switchToWorkspace('History week')
    await expect(topBar.coursePill).toHaveText('Modern History')

    // 4. Archive it: no picker offers it, the board keeps it, the to-do still shows it. Restore brings it back.
    await topBar.courseSelect.selectOption({ label: 'Edit courses...' })
    const archived = answered(page, 'courses.update')
    await courses.getByRole('button', { name: 'Archive Modern History' }).click()
    await archived()
    await courses.getByRole('button', { name: 'Done' }).click()
    await expect(topBar.coursePill).toHaveText('Modern History (archived)')
    await calendar.showHours(6, 7)
    await calendar.clickAt(5, 6.1)
    // A new item starts in the board's course, so that one is kept, marked archived; no other course is offered.
    await expect(calendar.popover.getByLabel('Course', { exact: true }).locator('option'))
      .toHaveText(['No course', 'Modern History (archived)', 'Biology', 'Chemistry', 'Physics', 'New course...'])
    await page.keyboard.press('Escape')
    await topBar.switchToWorkspace('Everything')
    await expect(everythingRow.getByText('Modern History', { exact: true })).toBeVisible()
    await expect(topBar.courseSelect.locator('option')).toHaveText(['All courses', 'Biology', 'Chemistry', 'Physics', 'New course...', 'Edit courses...'])
    await topBar.courseSelect.selectOption({ label: 'Edit courses...' })
    await courses.getByRole('button', { name: 'Archived (1)' }).click()
    const restored = answered(page, 'courses.update')
    await courses.getByRole('button', { name: 'Restore Modern History' }).click()
    await restored()
    await courses.getByRole('button', { name: 'Done' }).click()
    await expect(topBar.courseSelect.locator('option', { hasText: 'Modern History' })).toHaveCount(1)
    await topBar.switchToWorkspace('History week')
    await expect(topBar.coursePill).toHaveText('Modern History')

    // 5. Delete waits until nothing files under it; then the board shows every course.
    await topBar.courseSelect.selectOption({ label: 'Edit courses...' })
    const row = courses.getByTestId('course-row').filter({ has: page.getByRole('textbox', { name: 'Name of Modern History' }) })
    // The to-do and the class, the class's lecture (opening the class made it) and this board.
    await expect(row.getByTestId('course-usage')).toHaveText('Used by 1 lecture, 2 plan items and 1 board')
    await expect(row.getByRole('button', { name: 'Delete Modern History' })).toBeDisabled()
    await courses.getByRole('button', { name: 'Done' }).click()
    const items = await trpcQuery<PlanItem[]>(request, 'planItems.list', {})
    const mine = items.filter((i) => i.title === 'Read about the Tudors' || i.title === 'Tudor seminar')
    expect(mine).toHaveLength(2)
    for (const item of mine) await trpcMutation(request, 'planItems.delete', item.id)
    for (const lecture of (await trpcQuery<Lecture[]>(request, 'lectures.list', {})).filter((l) => l.course === mine[0].course)) {
      const preview = await trpcQuery<LectureDeletePreview>(request, 'lectures.deletePreview', lecture.id)
      await trpcMutation(request, 'lectures.delete', { id: lecture.id, fingerprint: preview.fingerprint })
    }
    await topBar.courseSelect.selectOption({ label: 'Edit courses...' })
    await expect(row.getByTestId('course-usage')).toHaveText('Used by 1 board')
    const deleted = answered(page, 'courses.delete')
    await row.getByRole('button', { name: 'Delete Modern History' }).click()
    await deleted()
    await expect(row).toHaveCount(0)
    await courses.getByRole('button', { name: 'Done' }).click()
    await expect(topBar.coursePill).toHaveText('All courses')
    await page.reload()
    await topBar.switchToWorkspace('History week')
    await expect(topBar.coursePill).toHaveText('All courses')
    await expect(topBar.courseSelect.locator('option', { hasText: 'Modern History' })).toHaveCount(0)
  })

  test('a class gets a new course from its popover, by mouse, and keeps its draft', async ({ page, request }) => {
    await createBoard(request, 'Timetable', ['calendar'])
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Timetable')
    await topBar.expectActiveWorkspace('Timetable')
    const calendar = new CalendarPom(page)
    await calendar.showHours(6, 7)
    await calendar.clickAt(6, 6.1)
    await calendar.popover.getByLabel('Title').fill('Latin grammar')
    await calendar.popover.getByLabel('Course', { exact: true }).selectOption({ label: 'New course...' })
    const dialog = page.getByRole('dialog', { name: 'New course' })
    await dialog.getByRole('textbox', { name: 'Name' }).click()
    await page.keyboard.type('Latin')
    const created = answered(page, 'courses.create')
    await dialog.getByRole('button', { name: 'Add course' }).click()
    await created()
    await expect(dialog).toHaveCount(0)
    await expect(calendar.popover.getByLabel('Title')).toHaveValue('Latin grammar')
    await expect(calendar.popover.getByLabel('Course', { exact: true }).locator('option:checked')).toHaveText('Latin')
    await calendar.popover.getByRole('button', { name: 'Add' }).click()
    await expect(calendar.block('Latin grammar')).toHaveAttribute('data-look', 'class')
  })
})
