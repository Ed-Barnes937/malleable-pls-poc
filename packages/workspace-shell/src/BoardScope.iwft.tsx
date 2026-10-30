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
const renameButton = (page: Page) => group(page).getByRole('button', { name: 'Rename lecture' })

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

    await renameButton(page).click()
    const input = page.getByRole('textbox', { name: 'Lecture name' })
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('Biology Lecture: Mitochondrial DNA')
    // The whole name is selected, so typing replaces it.
    expect(await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 34])
    await page.keyboard.type('mtDNA inheritance')
    await page.keyboard.press('Enter')

    await expect(lecturePill(page)).toHaveText('mtDNA inheritance')
    await expect(renameButton(page)).toBeFocused()
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
    await renameButton(page).click()
    await page.getByRole('textbox', { name: 'Lecture name' }).fill('Inheritance')
    await page.getByRole('textbox', { name: 'Lecture name' }).blur()
    await expect(lecturePill(page)).toHaveText('Inheritance')
    await expect.poll(() => simulator.db.lectures.find((l) => l.id === 'lec-rec-bio-4')?.title).toBe('Inheritance')
  })

  test('Escape and an empty name change nothing', async ({ mount, page, simulator }) => {
    await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
    const writes = await watch(page, 'lectures.update')
    const input = page.getByRole('textbox', { name: 'Lecture name' })

    await renameButton(page).click()
    await input.fill('Something else')
    await page.keyboard.press('Escape')
    await expect(input).toHaveCount(0)
    await expect(lecturePill(page)).toHaveText('Biology Lecture: Mitochondrial DNA')
    await expect(renameButton(page)).toBeFocused()

    await renameButton(page).click()
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
    await renameButton(page).click()
    await page.getByRole('textbox', { name: 'Lecture name' }).fill('Never saved')
    await page.keyboard.press('Enter')
    await expect(lecturePill(page)).toHaveText('Biology Lecture: Mitochondrial DNA')
    await expect(page.getByRole('status').or(page.getByRole('alert'))).toContainText("Couldn't rename the lecture - try again")
  })

  test('is offered only with a lecture selected', async ({ mount, page, simulator }) => {
    clearScope(simulator, 'ws-in-lecture')
    await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
    await expect(lecturePill(page)).toHaveText('No lecture')
    await expect(renameButton(page)).toHaveCount(0)
    // Not an option in the list, where an arrow key could land on it.
    await expect(lectureSelect(page).locator('option', { hasText: /Rename/ })).toHaveCount(0)
  })

  test('the field goes, renaming nothing, when the board moves to another lecture from elsewhere', async ({ mount, page, simulator }) => {
    await mount(<BoardScopeHarness workspaceId="ws-in-lecture" elsewhereLectureId="lec-rec-bio-3" />)
    const writes = await watch(page, 'lectures.update')
    await renameButton(page).click()
    const input = page.getByRole('textbox', { name: 'Lecture name' })
    await input.fill('Half typed')

    // A moment opened elsewhere (no focus moves: the field stays focused until it goes).
    await page.getByTestId('select-elsewhere').evaluate((el: HTMLButtonElement) => el.click())
    await expect(input).toHaveCount(0)
    await expect(lecturePill(page)).toHaveText('Biology Lecture: Mitochondria & Energy')
    await expect(renameButton(page)).toBeVisible()

    // Renaming again starts from the new lecture's own title.
    await renameButton(page).click()
    await expect(input).toHaveValue('Biology Lecture: Mitochondria & Energy')
    await page.keyboard.press('Escape')

    expect(writes.inputs).toEqual([])
    expect(simulator.db.lectures.find((l) => l.id === 'lec-rec-bio-3')?.title).toBe('Biology Lecture: Mitochondria & Energy')
    expect(simulator.db.lectures.find((l) => l.id === 'lec-rec-bio-4')?.title).toBe('Biology Lecture: Mitochondrial DNA')
  })
})

/**
 * Holds every call to `procedure` separately: `inputs` in arrival order,
 * `answer(i)` lets call i through to the simulator, `fail(i)` answers it 500.
 */
async function holdEach(page: Page, procedure: string) {
  const inputs: unknown[] = []
  const gates: { answer: () => void; fail: () => void }[] = []
  await page.route((url) => url.pathname.split(/[/,]/).includes(procedure), async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, { json: unknown }>
    inputs.push(...Object.values(body).map((b) => b.json))
    const outcome = await new Promise<'answer' | 'fail'>((resolve) => {
      gates.push({ answer: () => resolve('answer'), fail: () => resolve('fail') })
    })
    if (outcome === 'fail') await route.fulfill({ status: 500, body: '{}' })
    else await route.fallback()
  })
  return {
    inputs,
    answer: async (i: number) => { await expect.poll(() => gates.length).toBeGreaterThan(i); gates[i].answer() },
    fail: async (i: number) => { await expect.poll(() => gates.length).toBeGreaterThan(i); gates[i].fail() },
  }
}

/**
 * Every (course, lecture) the pills read, sampled each animation frame, so a
 * state shown for a moment and gone again is caught.
 */
async function recordPills(page: Page) {
  await page.evaluate(() => {
    const seen: string[] = []
    ;(window as unknown as { pillStates: string[] }).pillStates = seen
    const read = () => {
      const text = (id: string) => document.querySelector(`[data-testid="${id}"] [data-testid="scope-pill-text"]`)?.textContent ?? '-'
      const state = `${text('scope-course')} > ${text('scope-lecture')}`
      if (seen[seen.length - 1] !== state) seen.push(state)
      requestAnimationFrame(read)
    }
    read()
  })
  return () => page.evaluate(() => (window as unknown as { pillStates: string[] }).pillStates)
}

/**
 * The pills went from `from` to `to` without flicker: `from` never comes
 * back, and once `to` shows nothing else does. (Both changes may land in one
 * frame, so the state between them need not be seen.)
 */
function expectSettledOnce(states: string[], from: string, to: string) {
  expect(states[0]).toBe(from)
  expect(states.slice(1)).not.toContain(from)
  expect(states.indexOf(to)).toBe(states.length - 1)
}

test.describe('two quick changes', () => {
  const DNA = 'Biology Lecture: Mitochondrial DNA'
  const ORGANIC = 'Chemistry Lecture: Organic Reactions'

  test('reach the server one at a time, in order, and the pills never show the first alone once the second is made', async ({ mount, page, simulator }) => {
    await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
    await expect(lecturePill(page)).toHaveText(DNA)
    const writes = await holdEach(page, 'workspaces.setBoardScope')
    const states = await recordPills(page)

    await courseSelect(page).selectOption({ label: 'Chemistry' })
    await lectureSelect(page).selectOption({ label: `${ORGANIC} · 9 Apr` })
    await expect(coursePill(page)).toHaveText('Chemistry')
    await expect(lecturePill(page)).toHaveText(ORGANIC)
    // The second waits for the first.
    await expect.poll(() => writes.inputs).toEqual([{ workspaceId: 'ws-in-lecture', courseTag: 'chemistry' }])

    await writes.answer(0)
    await expect.poll(() => writes.inputs).toHaveLength(2)
    expect(writes.inputs[1]).toEqual({ workspaceId: 'ws-in-lecture', lectureId: 'lec-rec-chem-1' })
    // The first answer (Chemistry, no lecture) is not shown over the second change.
    await page.waitForTimeout(200)
    await writes.answer(1)
    await expect.poll(() => simulator.db.workspaceScopes.filter((s) => s.workspace_id === 'ws-in-lecture').map((s) => s.scope_value).sort())
      .toEqual(['chemistry', 'lec-rec-chem-1'])
    await page.waitForTimeout(200)
    await expect(lecturePill(page)).toHaveText(ORGANIC)

    expectSettledOnce(await states(), `Biology > ${DNA}`, `Chemistry > ${ORGANIC}`)
  })

  test('the first failing takes back only the first: the second still shows, and is what the server is asked', async ({ mount, page, simulator }) => {
    await mount(<BoardScopeHarness workspaceId="ws-exam-prep" />)
    await expect(coursePill(page)).toHaveText('All courses')
    const writes = await holdEach(page, 'workspaces.setBoardScope')
    const states = await recordPills(page)

    await courseSelect(page).selectOption({ label: 'Chemistry' })
    await courseSelect(page).selectOption({ label: 'Biology' })
    await expect(coursePill(page)).toHaveText('Biology')

    await writes.fail(0)
    await expect(page.getByRole('status').or(page.getByRole('alert'))).toContainText("Couldn't change what this board shows - try again")
    await expect.poll(() => writes.inputs).toHaveLength(2)
    // Not put back to "All courses" over the newer change.
    await expect(coursePill(page)).toHaveText('Biology')
    await writes.answer(1)
    await expect.poll(() => simulator.db.workspaceScopes.filter((s) => s.workspace_id === 'ws-exam-prep').map((s) => s.scope_value))
      .toEqual(['biology'])
    await page.waitForTimeout(200)
    expectSettledOnce(await states(), 'All courses > -', 'Biology > -')
  })

  test('the second failing goes back to what the first left, not to before both', async ({ mount, page, simulator }) => {
    await mount(<BoardScopeHarness workspaceId="ws-exam-prep" />)
    await expect(coursePill(page)).toHaveText('All courses')
    const writes = await holdEach(page, 'workspaces.setBoardScope')

    await courseSelect(page).selectOption({ label: 'Chemistry' })
    await courseSelect(page).selectOption({ label: 'Biology' })
    await writes.answer(0)
    await writes.fail(1)
    await expect(page.getByRole('status').or(page.getByRole('alert'))).toContainText("Couldn't change what this board shows - try again")
    await expect(coursePill(page)).toHaveText('Chemistry')
    await expect(courseSelect(page)).toHaveValue('chemistry')
    expect(simulator.db.workspaceScopes.filter((s) => s.workspace_id === 'ws-exam-prep').map((s) => s.scope_value)).toEqual(['chemistry'])
  })
})

test('arrowing through courses by key (Windows, Linux) writes once, on Enter, and keeps the lecture until then', async ({ mount, page, simulator: _boards }) => {
  await mount(<BoardScopeHarness workspaceId="ws-in-lecture" />)
  await expect(lecturePill(page)).toHaveText('Biology Lecture: Mitochondrial DNA')
  const writes = await watch(page, 'workspaces.setBoardScope')
  const select = courseSelect(page)
  await select.focus()
  // Each press as those platforms fire it: the key, then the new value's `change`.
  for (const value of ['chemistry', 'biology', 'chemistry']) {
    await select.evaluate((el: HTMLSelectElement, v) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      el.value = v
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }, value)
  }
  await expect(coursePill(page)).toHaveText('Chemistry')
  // Nothing written yet: the Biology lecture is still the board's.
  await expect(lecturePill(page)).toHaveText('Biology Lecture: Mitochondrial DNA')
  expect(writes.inputs).toEqual([])

  await page.keyboard.press('Enter')
  await expect(lecturePill(page)).toHaveText('No lecture')
  await expect.poll(() => writes.inputs).toEqual([{ workspaceId: 'ws-in-lecture', courseTag: 'chemistry' }])
})

test('on a phone: no "Showing" word, same pills', async ({ mount, page, simulator: _boards }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await mount(<BoardScopeHarness workspaceId="ws-in-lecture" compact />)
  await expect(coursePill(page)).toHaveText('Biology')
  await expect(group(page)).not.toContainText('Showing')
  expect((await page.getByTestId('scope-course').boundingBox())!.height).toBeGreaterThanOrEqual(40)
})
