import type { Page } from '@playwright/test'
import { test, expect } from '../../../playwright/fixtures'
import { BoardScopeHarness } from '../../../playwright/board-scope-harness'
import type { BackendSimulator } from '../../../playwright/backend-simulator'

// Simulator boards: In Lecture (Record + Transcript: course and lecture,
// Biology > Mitochondrial DNA), Exam Prep (course only, no course set).

/**
 * Records the input of every call to `procedure` and, with `hold`, keeps
 * each one waiting until `release()`; the simulator answers it then.
 */
async function watch(page: Page, procedure: string, { hold = false } = {}) {
  const inputs: unknown[] = []
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route((url) => url.pathname.split(/[/,]/).includes(procedure), async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, { json: unknown }>
    inputs.push(...Object.values(body).map((b) => b.json))
    if (hold) await held
    await route.fallback()
  })
  return { inputs, release }
}

const group = (page: Page) => page.getByRole('group', { name: 'What this board shows' })
const coursePill = (page: Page) => page.getByTestId('scope-course').getByTestId('scope-pill-text')
const lecturePill = (page: Page) => page.getByTestId('scope-lecture').getByTestId('scope-pill-text')
const courseSelect = (page: Page) => group(page).getByRole('combobox', { name: 'Course' })
const lectureSelect = (page: Page) => group(page).getByRole('combobox', { name: 'Lecture' })

/** Clears a board's course and lecture in the simulator. */
function clearScope(simulator: BackendSimulator, workspaceId: string) {
  const rows = simulator.db.workspaceScopes
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].workspace_id === workspaceId) rows.splice(i, 1)
}

test('shows only the dimensions the widgets on the board use', async ({ mount, page, simulator: _boards }) => {
  const inLecture = await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
  await expect(group(page)).toContainText('Showing')
  await expect(coursePill(page)).toHaveText('Biology')
  await expect(lecturePill(page)).toHaveText('Biology Lecture: Mitochondrial DNA')
  await inLecture.unmount()

  await mount(<BoardScopeHarness workspaceId="ws-exam-prep" />)
  await expect(coursePill(page)).toHaveText('All courses')
  await expect(lectureSelect(page)).toHaveCount(0)
})

test('a board whose widgets use no scope shows nothing', async ({ mount, page, simulator }) => {
  simulator.db.workspaces.push({ ...simulator.db.workspaces[0], id: 'ws-empty', name: 'Empty', sort_order: 9 })
  await mount(<BoardScopeHarness workspaceId="ws-empty" />)
  await expect(page.getByTestId('board-scope')).toHaveCount(0)
})

test('"All courses" has a neutral dot, a course its colour', async ({ mount, page, simulator: _boards }) => {
  await mount(<BoardScopeHarness workspaceId="ws-exam-prep" />)
  const dot = page.getByTestId('scope-course').locator('span').first()
  await expect(dot).toHaveClass(/bg-text-muted/)
  await courseSelect(page).selectOption({ label: 'Chemistry' })
  await expect(dot).toHaveClass(/bg-course-chemistry/)
})

test('choosing a course is one write, and clears a lecture outside it at once', async ({ mount, page, simulator }) => {
  await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
  await expect(lecturePill(page)).toHaveText('Biology Lecture: Mitochondrial DNA')
  const writes = await watch(page, 'workspaces.setBoardScope', { hold: true })

  await courseSelect(page).selectOption({ label: 'Chemistry' })
  // Before the server answers.
  await expect(coursePill(page)).toHaveText('Chemistry')
  await expect(lecturePill(page)).toHaveText('No lecture')
  await expect(lectureSelect(page)).toHaveValue('')
  expect(writes.inputs).toEqual([{ workspaceId: 'ws-in-lecture', courseTag: 'chemistry' }])

  writes.release()
  await expect.poll(() => simulator.db.workspaceScopes.filter((s) => s.workspace_id === 'ws-in-lecture').map((s) => s.scope_value))
    .toEqual(['chemistry'])
  await expect(lecturePill(page)).toHaveText('No lecture')
  expect(writes.inputs).toHaveLength(1)
})

test('"All courses" sends null and clears the lecture', async ({ mount, page, simulator: _boards }) => {
  await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
  await expect(lecturePill(page)).toHaveText('Biology Lecture: Mitochondrial DNA')
  const writes = await watch(page, 'workspaces.setBoardScope')
  await courseSelect(page).selectOption({ label: 'All courses' })
  await expect(coursePill(page)).toHaveText('All courses')
  await expect(lecturePill(page)).toHaveText('No lecture')
  await expect.poll(() => writes.inputs).toEqual([{ workspaceId: 'ws-in-lecture', courseTag: null }])
})

test("choosing a lecture is one write, and the course follows it at once", async ({ mount, page, simulator }) => {
  clearScope(simulator, 'ws-in-lecture')
  await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
  await expect(coursePill(page)).toHaveText('All courses')
  await expect(lecturePill(page)).toHaveText('No lecture')
  // "All courses": every lecture, newest first.
  await expect(lectureSelect(page).locator('option')).toHaveText([
    'No lecture',
    'Biology Lecture: Mitochondrial DNA · 16 Apr',
    'Biology Lecture: Mitochondria & Energy · 11 Apr',
    'Chemistry Lecture: Organic Reactions · 9 Apr',
    'Biology Lecture: Cell Division · 4 Apr',
    'Biology Lecture: Cell Structure · 28 Mar',
  ])
  const writes = await watch(page, 'workspaces.setBoardScope', { hold: true })

  await lectureSelect(page).selectOption({ label: 'Chemistry Lecture: Organic Reactions · 9 Apr' })
  await expect(coursePill(page)).toHaveText('Chemistry')
  await expect(lecturePill(page)).toHaveText('Chemistry Lecture: Organic Reactions')
  expect(writes.inputs).toEqual([{ workspaceId: 'ws-in-lecture', lectureId: 'lec-rec-chem-1' }])
  writes.release()
  await expect.poll(() => simulator.db.workspaceScopes.filter((s) => s.workspace_id === 'ws-in-lecture').map((s) => s.scope_value).sort())
    .toEqual(['chemistry', 'lec-rec-chem-1'])
  expect(writes.inputs).toHaveLength(1)
})

test('the lecture list is the course\'s, with a lecture that has no audio yet saying so', async ({ mount, page, simulator }) => {
  simulator.db.lectures.push({
    id: 'lec-empty', title: 'Enzymes', course: 'biology', starts_at: '2026-04-20T10:00:00Z',
    class_item_id: null, class_date: null, created_at: '2026-04-20T10:00:00Z', updated_at: '2026-04-20T10:00:00Z',
  })
  simulator.db.lectures.push({
    id: 'lec-default', title: 'Biology lecture 21 Apr, 10:00', course: 'biology', starts_at: '2026-04-21T10:00:00Z',
    class_item_id: null, class_date: null, created_at: '2026-04-21T10:00:00Z', updated_at: '2026-04-21T10:00:00Z',
  })
  await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
  await expect(lectureSelect(page).locator('option')).toHaveText([
    'No lecture',
    // A default title has its date already.
    'Biology lecture 21 Apr, 10:00 · No recording',
    'Enzymes · 20 Apr · No recording',
    'Biology Lecture: Mitochondrial DNA · 16 Apr',
    'Biology Lecture: Mitochondria & Energy · 11 Apr',
    'Biology Lecture: Cell Division · 4 Apr',
    'Biology Lecture: Cell Structure · 28 Mar',
    'Rename this lecture...',
  ])
})

test('a failed write puts both pills back and says so', async ({ mount, page, simulator: _boards }) => {
  await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
  await expect(lecturePill(page)).toHaveText('Biology Lecture: Mitochondrial DNA')
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route((url) => url.pathname.split(/[/,]/).includes('workspaces.setBoardScope'), async (route) => {
    await held
    await route.fulfill({ status: 500, body: '{}' })
  })

  await courseSelect(page).selectOption({ label: 'Chemistry' })
  await expect(lecturePill(page)).toHaveText('No lecture')
  release()
  await expect(coursePill(page)).toHaveText('Biology')
  await expect(lecturePill(page)).toHaveText('Biology Lecture: Mitochondrial DNA')
  await expect(courseSelect(page)).toHaveValue('biology')
  await expect(lectureSelect(page)).toHaveValue('lec-rec-bio-4')
  await expect(page.getByRole('status').or(page.getByRole('alert'))).toContainText("Couldn't change what this board shows - try again")
})

test.describe('renaming the lecture inline', () => {
  test('Enter saves the new name, shown at once', async ({ mount, page, simulator }) => {
    await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
    await expect(lecturePill(page)).toHaveText('Biology Lecture: Mitochondrial DNA')
    const writes = await watch(page, 'lectures.update', { hold: true })

    await lectureSelect(page).selectOption({ label: 'Rename this lecture...' })
    const input = page.getByRole('textbox', { name: 'Lecture name' })
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('Biology Lecture: Mitochondrial DNA')
    // The whole name is selected, so typing replaces it.
    expect(await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 34])
    await page.keyboard.type('mtDNA inheritance')
    await page.keyboard.press('Enter')

    await expect(lecturePill(page)).toHaveText('mtDNA inheritance')
    await expect(lectureSelect(page)).toBeFocused()
    expect(writes.inputs).toEqual([{ id: 'lec-rec-bio-4', title: 'mtDNA inheritance' }])
    // No scope write, and the board keeps its lecture.
    await expect(lectureSelect(page)).toHaveValue('lec-rec-bio-4')
    writes.release()
    await expect.poll(() => simulator.db.lectures.find((l) => l.id === 'lec-rec-bio-4')?.title).toBe('mtDNA inheritance')
    await expect(lecturePill(page)).toHaveText('mtDNA inheritance')
    expect(writes.inputs).toHaveLength(1)
  })

  test('leaving the field saves too', async ({ mount, page, simulator }) => {
    await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
    await lectureSelect(page).selectOption({ label: 'Rename this lecture...' })
    await page.getByRole('textbox', { name: 'Lecture name' }).fill('Inheritance')
    await page.getByRole('textbox', { name: 'Lecture name' }).blur()
    await expect(lecturePill(page)).toHaveText('Inheritance')
    await expect.poll(() => simulator.db.lectures.find((l) => l.id === 'lec-rec-bio-4')?.title).toBe('Inheritance')
  })

  test('Escape and an empty name change nothing', async ({ mount, page, simulator }) => {
    await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
    const writes = await watch(page, 'lectures.update')
    const input = page.getByRole('textbox', { name: 'Lecture name' })

    await lectureSelect(page).selectOption({ label: 'Rename this lecture...' })
    await input.fill('Something else')
    await page.keyboard.press('Escape')
    await expect(input).toHaveCount(0)
    await expect(lecturePill(page)).toHaveText('Biology Lecture: Mitochondrial DNA')
    await expect(lectureSelect(page)).toBeFocused()

    await lectureSelect(page).selectOption({ label: 'Rename this lecture...' })
    await input.fill('   ')
    await page.keyboard.press('Enter')
    await expect(input).toHaveCount(0)
    await expect(lecturePill(page)).toHaveText('Biology Lecture: Mitochondrial DNA')

    expect(writes.inputs).toEqual([])
    expect(simulator.db.lectures.find((l) => l.id === 'lec-rec-bio-4')?.title).toBe('Biology Lecture: Mitochondrial DNA')
  })

  test('a failed rename brings the old name back and says so', async ({ mount, page, simulator: _boards }) => {
    await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
    await page.route((url) => url.pathname.split(/[/,]/).includes('lectures.update'), (route) => route.fulfill({ status: 500, body: '{}' }))
    await lectureSelect(page).selectOption({ label: 'Rename this lecture...' })
    await page.getByRole('textbox', { name: 'Lecture name' }).fill('Never saved')
    await page.keyboard.press('Enter')
    await expect(lecturePill(page)).toHaveText('Biology Lecture: Mitochondrial DNA')
    await expect(page.getByRole('status').or(page.getByRole('alert'))).toContainText("Couldn't rename the lecture - try again")
  })

  test('is offered only with a lecture selected', async ({ mount, page, simulator }) => {
    clearScope(simulator, 'ws-in-lecture')
    await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
    await expect(lecturePill(page)).toHaveText('No lecture')
    await expect(lectureSelect(page).locator('option', { hasText: 'Rename this lecture...' })).toHaveCount(0)
  })
})

test('on a phone: no "Showing" word, same pills', async ({ mount, page, simulator: _boards }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await mount(<BoardScopeHarness workspaceId="ws-in-lecture" compact />)
  await expect(coursePill(page)).toHaveText('Biology')
  await expect(group(page)).not.toContainText('Showing')
  expect((await page.getByTestId('scope-course').boundingBox())!.height).toBeGreaterThanOrEqual(40)
})
