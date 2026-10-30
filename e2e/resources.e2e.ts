import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { PanelGridPom, SidebarPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { trpcMutation, trpcQuery } from './api'
import { watchConsole } from '../playwright/console-guard'

/**
 * The Resources widget against the real server: links and markdown notes
 * for a course or a lecture. The seed gives dev-user-1 a Biology reading
 * list (a Google Doc) and a note on "Biology Lecture: Mitochondrial DNA".
 * Board scope is set through the API (setBoardScope, then a reload) or the
 * widget itself, not the scope pickers, which are moving into the header.
 */

const LECTURE = 'Biology Lecture: Mitochondrial DNA'
const LECTURE_ID = 'lec-rec-bio-4'

async function resourcesBoard(request: APIRequestContext, scope: { courseTag?: string; lectureId?: string } = { courseTag: 'biology' }) {
  const board = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: 'Course stuff' })
  await trpcMutation(request, 'workspaces.addPanel', {
    workspaceId: board.id, lensType: 'resources', slotName: 'resources', pos_x: 24, pos_y: 24, width: 520, height: 640,
  })
  await setScope(request, board.id, scope)
  return board.id
}

function setScope(request: APIRequestContext, workspaceId: string, scope: { courseTag?: string | null; lectureId?: string | null }) {
  return trpcMutation(request, 'workspaces.setBoardScope', { workspaceId, ...scope })
}

/** Loads the app (again) and opens the board; returns the widget. */
async function open(page: Page) {
  await page.goto('/')
  await new TopBarPom(page).switchToWorkspace('Course stuff')
  const panel = new PanelGridPom(page).panelByLabel('Resources')
  await expect(panel).toBeVisible()
  return panel
}

/** Holds every save of a resource back for `ms` before it goes to the server. */
async function slowSaves(page: Page, ms: number) {
  await page.route('**/*resources.update*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms))
    await route.continue()
  })
}

// Any React error (a render loop, a bad hook) fails the test.
let consoleErrors: ReturnType<typeof watchConsole>
test.beforeEach(({ page }) => {
  consoleErrors = watchConsole(page)
})
test.afterEach(() => {
  expect(consoleErrors.unexpected()).toEqual([])
})

/** Where each of dev-user-1's notes stands on the server. */
async function noteNamed(request: APIRequestContext, title: string) {
  const list = await trpcQuery<{ id: string; title: string }[]>(request, 'resources.list')
  const row = list.find((r) => r.title === title)
  return row && trpcQuery<{ body_md: string; lecture_id: string | null; course: string | null }>(request, 'resources.get', row.id)
}

test.describe('Resources', () => {
  test.beforeEach(async () => {
    await reseed()
  })
  test.afterAll(async () => {
    await reseed()
  })

  test('is in the palette under Capture and adds to a board', async ({ page, request }) => {
    await trpcMutation(request, 'workspaces.create', { name: 'Course stuff' })
    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Course stuff')
    await topBar.openDrawer()
    await new SidebarPom(page).addWidget('Resources')
    await expect(new PanelGridPom(page).panelByLabel('Resources')).toBeVisible()
  })

  test('a Google Doc link shows as one, and hides on another course with "+N in other courses"', async ({ page, request }) => {
    const board = await resourcesBoard(request)
    const panel = await open(page)
    await expect(panel.getByRole('link', { name: 'Biology reading list' })).toBeVisible()

    await panel.getByRole('button', { name: 'Add', exact: true }).click()
    await panel.getByRole('textbox', { name: 'Link to add' }).fill('https://docs.google.com/document/d/1NewDoc/edit?usp=sharing')
    await panel.getByRole('button', { name: 'Add link' }).click()
    const added = panel.getByTestId('resource-row').filter({ has: page.getByRole('link', { name: 'Google Doc', exact: true }) })
    await expect(added).toBeVisible()
    await expect(added.getByRole('link')).toHaveAttribute('href', 'https://docs.google.com/document/d/1NewDoc/edit?usp=sharing')

    await setScope(request, board, { courseTag: 'chemistry' })
    await open(page)
    await expect(panel.getByText('Nothing for Chemistry yet')).toBeVisible()
    await expect(panel.getByRole('link', { name: 'Google Doc', exact: true })).toHaveCount(0)
    // The two Biology links and the Biology lecture's note.
    await expect(panel.getByTestId('hidden-elsewhere')).toHaveText('+3 in other courses')
  })

  test('a note on a lecture keeps its formatting, files under "In lectures" without the lecture, and its title brings the lecture back', async ({ page, request }) => {
    const board = await resourcesBoard(request)
    const panel = await open(page)

    // Select the lecture from the widget: its title in "In lectures".
    await panel.getByRole('button', { name: 'In lectures (1)' }).click()
    await panel.getByRole('button', { name: LECTURE }).click()
    const thisLecture = panel.getByRole('region', { name: 'This lecture' })
    await expect(thisLecture.getByRole('button', { name: 'Mitochondrial DNA - key points', exact: true })).toBeVisible()

    await panel.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(panel.getByRole('radio', { name: `This lecture: ${LECTURE}` })).toBeChecked()
    await panel.getByRole('button', { name: 'Write a note' }).click()
    await panel.getByRole('textbox', { name: 'Note title' }).fill('Inheritance')
    const editor = panel.getByRole('textbox', { name: 'Inheritance' })
    await editor.click()
    await panel.getByRole('button', { name: 'Heading' }).click()
    await page.keyboard.type('Maternal line')
    await page.keyboard.press('Enter')
    await panel.getByRole('button', { name: 'Bold' }).click()
    await page.keyboard.type('Only')
    await panel.getByRole('button', { name: 'Bold' }).click()
    await page.keyboard.type(' from the mother')
    await page.keyboard.press('Enter')
    await panel.getByRole('button', { name: 'Task list' }).click()
    await page.keyboard.type('Ask about heteroplasmy')
    // Leaving the note saves the last keystrokes too.
    await panel.getByRole('button', { name: 'Back to resources' }).click()
    await expect.poll(async () => noteNamed(request, 'Inheritance')).toMatchObject({
      lecture_id: LECTURE_ID,
      body_md: '## Maternal line\n\n**Only** from the mother\n\n- [ ] Ask about heteroplasmy\n',
    })

    await open(page)
    await panel.getByRole('region', { name: 'This lecture' }).getByRole('button', { name: 'Inheritance', exact: true }).click()
    const reopened = panel.getByRole('textbox', { name: 'Inheritance' })
    await expect(reopened.locator('h2')).toHaveText('Maternal line')
    await expect(reopened.locator('strong')).toHaveText('Only')
    await expect(reopened.locator('li[data-item-type="task"]')).toHaveText('Ask about heteroplasmy')
    await panel.getByRole('button', { name: 'Back to resources' }).click()

    // Without the lecture, the note is under "In lectures"; its title selects the lecture again.
    await setScope(request, board, { lectureId: null })
    await open(page)
    await expect(panel.getByRole('region', { name: 'This lecture' })).toHaveCount(0)
    await panel.getByRole('button', { name: 'In lectures (2)' }).click()
    await expect(panel.getByRole('button', { name: 'Inheritance', exact: true })).toBeVisible()
    await panel.getByRole('button', { name: LECTURE }).click()
    await expect(panel.getByRole('region', { name: 'This lecture' }).getByRole('button', { name: 'Inheritance', exact: true })).toBeVisible()
  })

  test('the Markdown toggle edits the source; switching back shows it formatted, and it saves', async ({ page, request }) => {
    await resourcesBoard(request, { lectureId: LECTURE_ID })
    const panel = await open(page)
    await panel.getByRole('button', { name: 'Mitochondrial DNA - key points', exact: true }).click()
    await panel.getByRole('button', { name: 'Markdown' }).click()
    const source = panel.getByRole('textbox', { name: 'Markdown source' })
    await expect(source).toHaveValue(/Inherited from the \*\*mother\*\* only/)
    await source.fill('Now **bold** here')
    await panel.getByRole('button', { name: 'Markdown' }).click()
    await expect(panel.getByRole('textbox', { name: 'Mitochondrial DNA - key points' }).locator('strong')).toHaveText('bold')
    await expect(panel.getByRole('status')).toHaveText('Saved')
    await expect.poll(async () => (await noteNamed(request, 'Mitochondrial DNA - key points'))?.body_md).toBe('Now **bold** here\n')
  })

  test('a note reopened before its last save is answered keeps both edits, with no conflict', async ({ page, request }) => {
    await resourcesBoard(request, { lectureId: LECTURE_ID })
    await trpcMutation(request, 'resources.createNote', { lectureId: LECTURE_ID, title: 'Slow note' })
    await slowSaves(page, 1500)
    const panel = await open(page)
    await panel.getByRole('button', { name: 'Slow note', exact: true }).click()
    await panel.getByRole('textbox', { name: 'Slow note' }).click()
    await page.keyboard.type('FIRST')
    await panel.getByRole('button', { name: 'Back to resources' }).click()

    await panel.getByRole('button', { name: 'Slow note', exact: true }).click()
    const editor = panel.getByRole('textbox', { name: 'Slow note' })
    await expect(editor).toHaveText('FIRST')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' SECOND')
    await expect(panel.getByRole('status')).toHaveText('Saved', { timeout: 10_000 })
    await expect(panel.getByRole('alert')).toHaveCount(0)
    await panel.getByRole('button', { name: 'Back to resources' }).click()
    await expect.poll(async () => (await noteNamed(request, 'Slow note'))?.body_md, { timeout: 10_000 }).toBe('FIRST SECOND\n')
  })
})

test.describe('Resources on a phone', () => {
  test.use({ viewport: { width: 400, height: 860 } })
  test.beforeEach(async () => {
    await reseed()
  })
  test.afterAll(async () => {
    await reseed()
  })

  test('a note opens full screen; what is typed is there after closing', async ({ page, request }) => {
    await resourcesBoard(request, { lectureId: LECTURE_ID })
    const panel = await open(page)
    await panel.getByRole('button', { name: 'Mitochondrial DNA - key points', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Note' })
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box?.width).toBe(400)
    expect(box?.height).toBe(860)

    const editor = dialog.getByRole('textbox', { name: 'Mitochondrial DNA - key points' })
    await editor.getByText('Ask about heteroplasmy in the seminar').click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Typed on my phone')
    await expect(dialog.getByRole('status')).toHaveText('Saved')
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toHaveCount(0)

    await expect.poll(async () => (await noteNamed(request, 'Mitochondrial DNA - key points'))?.body_md).toContain('Typed on my phone')
    await panel.getByRole('button', { name: 'Mitochondrial DNA - key points', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Note' }).getByText('Typed on my phone')).toBeVisible()
  })

  test('closing and reopening the note before its save is answered keeps both edits, with no conflict', async ({ page, request }) => {
    await resourcesBoard(request, { lectureId: LECTURE_ID })
    await trpcMutation(request, 'resources.createNote', { lectureId: LECTURE_ID, title: 'Slow note' })
    await slowSaves(page, 1500)
    const panel = await open(page)
    const dialog = page.getByRole('dialog', { name: 'Note' })
    await panel.getByRole('button', { name: 'Slow note', exact: true }).click()
    await dialog.getByRole('textbox', { name: 'Slow note' }).click()
    await page.keyboard.type('FIRST')
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toHaveCount(0)

    await panel.getByRole('button', { name: 'Slow note', exact: true }).click()
    const editor = dialog.getByRole('textbox', { name: 'Slow note' })
    await expect(editor).toHaveText('FIRST')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' SECOND')
    await expect(dialog.getByRole('status')).toHaveText('Saved', { timeout: 10_000 })
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect.poll(async () => (await noteNamed(request, 'Slow note'))?.body_md, { timeout: 10_000 }).toBe('FIRST SECOND\n')
  })
})
