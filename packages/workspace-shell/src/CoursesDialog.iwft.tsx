import type { Page } from '@playwright/test'
import { test, expect } from '../../../playwright/fixtures'
import { BoardScopeHarness } from '../../../playwright/board-scope-harness'

// Simulator: Biology (green), Chemistry (blue), Physics (purple). Exam Prep
// is an "All courses" board whose widgets use the course alone.

const coursePill = (page: Page) => page.getByTestId('scope-course').getByTestId('scope-pill-text')
const courseDot = (page: Page) => page.getByTestId('scope-course').getByTestId('scope-pill-dot')
const courseSelect = (page: Page) => page.getByRole('group', { name: 'What this board shows' }).getByRole('combobox', { name: 'Course' })
const newCourseDialog = (page: Page) => page.getByRole('dialog', { name: 'New course' })
const coursesDialog = (page: Page) => page.getByRole('dialog', { name: 'Courses' })
const row = (page: Page, id: string) => coursesDialog(page).locator(`[data-testid="course-row"][data-course="${id}"]`)

test.describe('"New course..." in the board course pill', () => {
  test('makes the course in the next free colour and puts the board on it, focus back on the pill', async ({ mount, page, simulator }) => {
    await mount(<BoardScopeHarness workspaceId="ws-exam-prep" />)
    await expect(coursePill(page)).toHaveText('All courses')
    await courseSelect(page).selectOption({ label: 'New course...' })
    const dialog = newCourseDialog(page)
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toBeFocused()
    // The colour it will take, shown before it is made.
    await expect(dialog.getByTestId('new-course-color')).toHaveAttribute('data-color', 'amber')
    await expect(dialog.getByRole('button', { name: 'Add course' })).toBeDisabled()
    await dialog.getByRole('textbox', { name: 'Name' }).fill('  History ')
    await dialog.getByRole('button', { name: 'Add course' }).click()

    await expect(dialog).toHaveCount(0)
    await expect(coursePill(page)).toHaveText('History')
    await expect(courseDot(page)).toHaveClass(/bg-course-amber/)
    await expect(courseSelect(page)).toBeFocused()
    const history = simulator.db.courses.find((c) => c.name === 'History')!
    expect(history).toMatchObject({ color: 'amber', archived_at: null })
    await expect.poll(() => simulator.db.workspaceScopes.filter((s) => s.workspace_id === 'ws-exam-prep').map((s) => s.scope_value)).toEqual([history.id])
  })

  test('a name the student has is refused in the dialog; Cancel and Escape change nothing', async ({ mount, page, simulator, consoleErrors }) => {
    consoleErrors.allowFailedRequest('courses.create')
    await mount(<BoardScopeHarness workspaceId="ws-exam-prep" />)
    await courseSelect(page).selectOption({ label: 'New course...' })
    const name = newCourseDialog(page).getByRole('textbox', { name: 'Name' })
    await name.fill('biology')
    await page.keyboard.press('Enter')
    await expect(newCourseDialog(page).getByRole('alert')).toHaveText('You already have a course called Biology')
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await newCourseDialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(newCourseDialog(page)).toHaveCount(0)
    await expect(coursePill(page)).toHaveText('All courses')

    await courseSelect(page).selectOption({ label: 'New course...' })
    await page.keyboard.press('Escape')
    await expect(newCourseDialog(page)).toHaveCount(0)
    await expect(coursePill(page)).toHaveText('All courses')
    expect(simulator.db.courses).toHaveLength(3)
  })

  test('a student with no courses is told so, and offered "New course..." alone', async ({ mount, page, simulator }) => {
    simulator.db.courses.splice(0)
    await mount(<BoardScopeHarness workspaceId="ws-exam-prep" />)
    const options = courseSelect(page).locator('option')
    await expect(options).toHaveText(['All courses', 'No courses yet', 'New course...'])
    await expect(courseSelect(page).getByRole('option', { name: 'No courses yet' })).toBeDisabled()

    await courseSelect(page).selectOption({ label: 'New course...' })
    await newCourseDialog(page).getByRole('textbox', { name: 'Name' }).fill('Art')
    await page.keyboard.press('Enter')
    await expect(coursePill(page)).toHaveText('Art')
    await expect(courseDot(page)).toHaveClass(/bg-course-green/)
    // Now there is a course to edit.
    await expect(options).toHaveText(['All courses', 'Art', 'New course...', 'Edit courses...'])
  })
})

test.describe('the Courses dialog ("Edit courses...")', () => {
  test('renames and recolours: the board pill follows at once; Escape in a name puts it back', async ({ mount, page, simulator }) => {
    await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
    await expect(coursePill(page)).toHaveText('Biology')
    await courseSelect(page).selectOption({ label: 'Edit courses...' })
    await expect(coursesDialog(page).getByRole('button', { name: 'Done' })).toBeFocused()
    const names = () => coursesDialog(page).getByRole('textbox').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))
    await expect.poll(names).toEqual(['Biology', 'Chemistry', 'Physics'])

    const name = row(page, 'biology').getByRole('textbox', { name: 'Name of Biology' })
    await name.fill('Cell Biology')
    await name.press('Enter')
    await expect(coursePill(page)).toHaveText('Cell Biology')
    await expect.poll(() => simulator.db.courses.find((c) => c.id === 'biology')?.name).toBe('Cell Biology')

    // Escape in a changed name puts it back, and leaves the dialog open.
    const chem = row(page, 'chemistry').getByRole('textbox', { name: 'Name of Chemistry' })
    await chem.fill('Chem')
    await chem.press('Escape')
    await expect(chem).toHaveValue('Chemistry')
    await expect(coursesDialog(page)).toBeVisible()

    await row(page, 'biology').getByRole('button', { name: 'Colour for Cell Biology: Green' }).click()
    await row(page, 'biology').getByRole('radio', { name: 'Teal' }).click()
    await expect(courseDot(page)).toHaveClass(/bg-course-teal/)
    await expect.poll(() => simulator.db.courses.find((c) => c.id === 'biology')?.color).toBe('teal')

    await coursesDialog(page).getByRole('button', { name: 'Done' }).click()
    await expect(coursesDialog(page)).toHaveCount(0)
    await expect(courseSelect(page)).toBeFocused()
  })

  test('a name another course has is refused, and the name goes back', async ({ mount, page, simulator: _courses, consoleErrors }) => {
    consoleErrors.allowFailedRequest('courses.update')
    await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
    await courseSelect(page).selectOption({ label: 'Edit courses...' })
    const name = row(page, 'physics').getByRole('textbox', { name: 'Name of Physics' })
    await name.fill('chemistry')
    await name.press('Enter')
    await expect(coursesDialog(page).getByRole('alert')).toHaveText('You already have a course called Chemistry')
    await expect(row(page, 'physics').getByRole('textbox')).toHaveValue('Physics')
  })

  test('archive and restore: gone from the list but kept on the board; Delete only for an unused course', async ({ mount, page, simulator }) => {
    await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
    await courseSelect(page).selectOption({ label: 'Edit courses...' })
    // Biology files the seeded lectures: it can only be archived.
    await expect(row(page, 'biology').getByTestId('course-usage')).toHaveText(/^Used by \d+ lectures and \d+ boards?$/)
    await expect(row(page, 'biology').getByRole('button', { name: 'Delete Biology' })).toBeDisabled()
    await expect(row(page, 'physics').getByTestId('course-usage')).toHaveText('Not used yet')
    await expect(row(page, 'physics').getByRole('button', { name: 'Delete Physics' })).toBeEnabled()

    await row(page, 'biology').getByRole('button', { name: 'Archive Biology' }).click()
    await expect(coursePill(page)).toHaveText('Biology (archived)')
    await expect(row(page, 'biology')).toHaveCount(0)
    const archived = coursesDialog(page).getByRole('button', { name: 'Archived (1)' })
    await expect(archived).toHaveAttribute('aria-expanded', 'false')
    await archived.click()
    await expect(coursesDialog(page).getByRole('list', { name: 'Archived courses' }).getByRole('textbox')).toHaveValue('Biology')
    await expect.poll(() => simulator.db.courses.find((c) => c.id === 'biology')?.archived_at).not.toBeNull()

    await row(page, 'biology').getByRole('button', { name: 'Restore Biology' }).click()
    await expect(coursePill(page)).toHaveText('Biology')
    await expect(coursesDialog(page).getByRole('button', { name: /^Archived/ })).toHaveCount(0)

    await row(page, 'physics').getByRole('button', { name: 'Delete Physics' }).click()
    await expect(row(page, 'physics')).toHaveCount(0)
    await expect(page.getByRole('status').or(page.getByRole('alert'))).toContainText('Deleted Physics')
    expect(simulator.db.courses.map((c) => c.id)).toEqual(['biology', 'chemistry'])
  })

  test('deleting the board\'s own course puts the board on All courses', async ({ mount, page, simulator }) => {
    simulator.db.courses.push({ id: 'typo', name: 'Typo', color: 'rose', archived_at: null })
    await mount(<BoardScopeHarness workspaceId="ws-exam-prep" />)
    await courseSelect(page).selectOption({ label: 'Typo' })
    await expect(coursePill(page)).toHaveText('Typo')
    await courseSelect(page).selectOption({ label: 'Edit courses...' })
    await expect(row(page, 'typo').getByTestId('course-usage')).toHaveText('Used by 1 board')
    await row(page, 'typo').getByRole('button', { name: 'Delete Typo' }).click()
    await coursesDialog(page).getByRole('button', { name: 'Done' }).click()
    await expect(coursePill(page)).toHaveText('All courses')
    expect(simulator.db.workspaceScopes.filter((s) => s.workspace_id === 'ws-exam-prep')).toEqual([])
  })
})
