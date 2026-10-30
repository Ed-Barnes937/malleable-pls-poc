import { StrictMode } from 'react'
import type { Page, Route } from '@playwright/test'
import type { Scope } from '@pls/lens-framework'
import { test, expect } from '../../../playwright/fixtures'
import { watchConsole } from '../../../playwright/console-guard'
import { TestProviders } from '../../../playwright/mount-wrapper'
import type { BackendSimulator } from '../../../playwright/backend-simulator'
import type { StoredResource } from '../../../playwright/backend-simulator/in-memory-db'
import ResourcesLens from './ResourcesLens'

const defaultProps = { panelId: 'test-panel', scope: {}, config: {} }

// Any React error (a render loop, a bad hook) fails the test.
let consoleErrors: ReturnType<typeof watchConsole>
test.beforeEach(({ page }) => {
  consoleErrors = watchConsole(page)
})
test.afterEach(() => {
  expect(consoleErrors.unexpected()).toEqual([])
})

/** Holds every `resources.update` request back for `ms` before the simulator answers it. */
async function slowSaves(page: Page, ms: number) {
  await page.route('**/*resources.update*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms))
    await route.fallback()
  })
}

/** Every `resources.update` fails as if offline, until the returned function is called. */
async function offlineSaves(page: Page) {
  consoleErrors.allow(/Failed to load resource/)
  const handler = (route: Route) => route.abort('internetdisconnected')
  await page.route('**/*resources.update*', handler)
  return () => page.unroute('**/*resources.update*', handler)
}

/** Counts the requests to a procedure from now on. */
function countRequests(page: Page, procedure: string) {
  const seen = { count: 0 }
  page.on('request', (request) => {
    if (request.url().includes(procedure)) seen.count++
  })
  return seen
}
const BIO_LECTURE = 'lec-rec-bio-4'
const BIO_LECTURE_TITLE = 'Biology Lecture: Mitochondrial DNA'

function seedResource(simulator: BackendSimulator, fields: Partial<StoredResource> & Pick<StoredResource, 'id' | 'title'>) {
  simulator.db.resources.push({
    kind: 'note',
    url: null,
    provider: null,
    body_md: '',
    file_name: null,
    mime_type: null,
    size_bytes: null,
    lecture_id: null,
    course: null,
    created_at: '2026-10-30T10:00:00.000Z',
    updated_at: '2026-10-30T10:00:00.000Z',
    ...fields,
  })
}

test('with no course: the empty state invites adding links and notes', async ({ mount, page, simulator: _simulator }) => {
  await mount(<TestProviders><ResourcesLens {...defaultProps} /></TestProviders>)
  await expect(page.getByText('Keep links and notes for your courses here')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add link' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Write a note' })).toBeVisible()
})

test('a Biology board: adds a Google Sheet link under Biology, labelled as a sheet', async ({ mount, page, simulator }) => {
  await mount(<TestProviders><ResourcesLens {...defaultProps} scope={{ courseTag: 'biology' }} /></TestProviders>)
  await expect(page.getByText('Nothing for Biology yet')).toBeVisible()
  await page.getByRole('button', { name: 'Add link' }).click()
  const input = page.getByRole('textbox', { name: 'Link to add' })
  await input.fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(page.getByRole('alert')).toHaveText('Links start with http:// or https://')

  await input.fill('https://docs.google.com/spreadsheets/d/1XyZ/edit#gid=0')
  await page.getByRole('button', { name: 'Add link' }).click()
  const row = page.getByTestId('resource-row')
  await expect(row).toHaveCount(1)
  const link = row.getByRole('link', { name: 'Google Sheet' })
  await expect(link).toHaveAttribute('href', 'https://docs.google.com/spreadsheets/d/1XyZ/edit#gid=0')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(row.getByText('Google Sheet', { exact: true }).last()).toBeVisible()
  expect(simulator.db.resources).toEqual([expect.objectContaining({ kind: 'link', provider: 'google_sheet', course: 'biology', lecture_id: null })])
})

test('filters to the board course and says what it leaves out', async ({ mount, page, simulator }) => {
  seedResource(simulator, { id: 'r-bio', title: 'Bio note', course: 'biology' })
  seedResource(simulator, { id: 'r-bio-lecture', title: 'Lecture note', lecture_id: BIO_LECTURE })
  seedResource(simulator, { id: 'r-chem', title: 'Chem note', course: 'chemistry' })
  seedResource(simulator, { id: 'r-loose', title: 'Loose note' })
  await mount(<TestProviders><ResourcesLens {...defaultProps} scope={{ courseTag: 'biology' }} /></TestProviders>)
  await expect(page.getByText('Bio note')).toBeVisible()
  await expect(page.getByText('Chem note')).toHaveCount(0)
  await expect(page.getByTestId('hidden-elsewhere')).toHaveText('+1 in other courses · 1 with no course')
})

test("without a lecture: course items, then the lectures' items under a collapsed group; a title selects the lecture", async ({ mount, page, simulator }) => {
  seedResource(simulator, { id: 'r-bio', title: 'Reading list', course: 'biology' })
  seedResource(simulator, { id: 'r-l1', title: 'mtDNA notes', lecture_id: BIO_LECTURE })
  seedResource(simulator, { id: 'r-l2', title: 'mtDNA slides', lecture_id: BIO_LECTURE })
  const scopes: Partial<Scope>[] = []
  await mount(
    <TestProviders>
      <ResourcesLens {...defaultProps} scope={{ courseTag: 'biology' }} onScopeChange={(patch) => { scopes.push(patch) }} />
    </TestProviders>,
  )
  await expect(page.getByText('Reading list')).toBeVisible()
  const group = page.getByRole('button', { name: 'In lectures (2)' })
  await expect(group).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText('mtDNA notes')).toHaveCount(0)
  await group.click()
  await expect(page.getByText('mtDNA notes')).toBeVisible()
  await page.getByRole('button', { name: BIO_LECTURE_TITLE }).click()
  await expect.poll(() => scopes).toEqual([{ lectureId: BIO_LECTURE }])
})

test('with a lecture: "This lecture" first, then the course; new items attach to the lecture unless the student picks the course', async ({ mount, page, simulator }) => {
  seedResource(simulator, { id: 'r-bio', title: 'Reading list', course: 'biology' })
  await mount(
    <TestProviders>
      <ResourcesLens {...defaultProps} scope={{ courseTag: 'biology', lectureId: BIO_LECTURE }} />
    </TestProviders>,
  )
  const thisLecture = page.getByRole('region', { name: 'This lecture' })
  await expect(thisLecture.getByText('Nothing for this lecture yet')).toBeVisible()
  await expect(thisLecture.getByText(BIO_LECTURE_TITLE)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Course' }).getByText('Reading list')).toBeVisible()

  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('radio', { name: `This lecture: ${BIO_LECTURE_TITLE}` })).toBeChecked()
  await page.getByRole('textbox', { name: 'Link to add' }).fill('https://docs.google.com/document/d/1Doc/edit')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(thisLecture.getByRole('link', { name: 'Google Doc' })).toBeVisible()
  expect(simulator.db.resources.find((r) => r.provider === 'google_doc')).toMatchObject({ lecture_id: BIO_LECTURE, course: null })

  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByText('Whole course: Biology').click()
  await page.getByRole('textbox', { name: 'Link to add' }).fill('https://www.khanacademy.org/biology')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(page.getByRole('region', { name: 'Course' }).getByRole('link', { name: 'khanacademy.org' })).toBeVisible()
  expect(simulator.db.resources.find((r) => r.provider === 'web')).toMatchObject({ lecture_id: null, course: 'biology' })
})

test('the editor is not downloaded until a note opens; a new note opens in it and autosaves', async ({ mount, page, simulator }) => {
  const editorRequests: string[] = []
  page.on('request', (request) => {
    if (/NoteEditor|milkdown/i.test(request.url())) editorRequests.push(request.url())
  })
  seedResource(simulator, { id: 'r-link', title: 'A link', kind: 'link', url: 'https://example.com', provider: 'web', body_md: null, course: 'biology' })
  await mount(<TestProviders><ResourcesLens {...defaultProps} scope={{ courseTag: 'biology' }} /></TestProviders>)
  await expect(page.getByText('A link')).toBeVisible()
  expect(editorRequests).toEqual([])

  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByRole('button', { name: 'Write a note' }).click()
  const editor = page.getByRole('textbox', { name: 'Untitled note' })
  await expect(editor).toBeVisible()
  expect(editorRequests.length).toBeGreaterThan(0)

  const listReads = countRequests(page, 'resources.list')
  await page.getByRole('textbox', { name: 'Note title' }).fill('Enzymes')
  await editor.click()
  await page.keyboard.type('Lock and key')
  await expect(page.getByRole('status')).toHaveText('Saved')
  // Autosave updates the list in place; it never reads the lists again.
  expect(listReads.count).toBe(0)
  await expect.poll(() => simulator.db.resources.find((r) => r.kind === 'note')).toMatchObject({ title: 'Enzymes', body_md: 'Lock and key\n', course: 'biology' })

  await page.getByRole('button', { name: 'Back to resources' }).click()
  const row = page.getByTestId('resource-row').filter({ hasText: 'Enzymes' })
  await expect(row.getByText(/^Note · edited/)).toBeVisible()
  await expect(row.getByText('Lock and key')).toBeVisible()
})

test('a save on top of a change made elsewhere is refused: reload takes theirs, keep mine saves over it', async ({ mount, page, simulator }) => {
  seedResource(simulator, { id: 'r-note', title: 'Shared note', body_md: 'original', course: 'biology' })
  await mount(<TestProviders><ResourcesLens {...defaultProps} scope={{ courseTag: 'biology' }} /></TestProviders>)
  await page.getByRole('button', { name: 'Shared note', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Shared note' })
  await expect(editor).toHaveText('original')

  // Another device saves meanwhile.
  Object.assign(simulator.db.resources[0], { body_md: 'from the laptop', updated_at: '2026-10-30T11:00:00.000Z' })
  await editor.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' from the phone')
  const banner = page.getByRole('alert')
  await expect(banner).toContainText('Changed on another device')
  await expect(editor).toHaveAttribute('contenteditable', 'false')
  expect(simulator.db.resources[0].body_md).toBe('from the laptop')

  await banner.getByRole('button', { name: 'Reload' }).click()
  await expect(page.getByRole('textbox', { name: 'Shared note' })).toHaveText('from the laptop')
  await expect(banner).toHaveCount(0)

  // Again, and this time keep mine.
  Object.assign(simulator.db.resources[0], { body_md: 'laptop again', updated_at: '2026-10-30T12:00:00.000Z' })
  await page.getByRole('textbox', { name: 'Shared note' }).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' mine')
  await page.getByRole('alert').getByRole('button', { name: 'Keep mine' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  expect(simulator.db.resources[0].body_md).toBe('from the laptop mine\n')
})

test('rename, move and delete with undo', async ({ mount, page, simulator }) => {
  seedResource(simulator, { id: 'r-note', title: 'Draft', course: 'biology' })
  await mount(<TestProviders><ResourcesLens {...defaultProps} scope={{ courseTag: 'biology' }} /></TestProviders>)

  const updates = countRequests(page, 'resources.update')
  await page.getByRole('button', { name: 'More for Draft' }).click()
  await page.getByRole('button', { name: 'Rename' }).click()
  const name = page.getByRole('textbox', { name: 'New name for Draft' })
  await name.fill('Cell notes')
  await name.press('Enter')
  await expect(page.getByRole('button', { name: 'Cell notes', exact: true })).toBeVisible()
  await expect.poll(() => simulator.db.resources[0].title).toBe('Cell notes')
  // Enter, then the input's blur as it goes: one rename.
  expect(updates.count).toBe(1)

  await page.getByRole('button', { name: 'More for Cell notes' }).click()
  await page.getByRole('button', { name: 'Move' }).click()
  const dialog = page.getByRole('dialog', { name: 'Move Cell notes' })
  await dialog.getByRole('combobox', { name: 'Move to' }).selectOption({ label: BIO_LECTURE_TITLE })
  await dialog.getByRole('button', { name: 'Move' }).click()
  await expect.poll(() => simulator.db.resources[0]).toMatchObject({ lecture_id: BIO_LECTURE, course: null })
  await expect(page.getByRole('button', { name: 'In lectures (1)' })).toBeVisible()
  await page.getByRole('button', { name: 'In lectures (1)' }).click()

  await page.getByRole('button', { name: 'More for Cell notes' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Deleted Cell notes')).toBeVisible()
  await page.getByRole('button', { name: 'Undo delete: Cell notes' }).click()
  await expect(page.getByRole('button', { name: 'Cell notes', exact: true })).toBeVisible()
  expect(simulator.db.resources).toHaveLength(1)

  await page.getByRole('button', { name: 'More for Cell notes' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect.poll(() => simulator.db.resources.length, { timeout: 8000 }).toBe(0)
  await expect(page.getByText('Nothing for Biology yet')).toBeVisible()
})

test('leaving a note at once still saves the last keystrokes', async ({ mount, page, simulator }) => {
  seedResource(simulator, { id: 'r-note', title: 'Quick', body_md: '', course: 'biology' })
  await mount(<TestProviders><ResourcesLens {...defaultProps} scope={{ courseTag: 'biology' }} /></TestProviders>)
  await page.getByRole('button', { name: 'Quick', exact: true }).click()
  await page.getByRole('textbox', { name: 'Quick' }).click()
  await page.keyboard.type('Last words')
  await page.getByRole('button', { name: 'Back to resources' }).click()
  await expect.poll(() => simulator.db.resources[0].body_md).toBe('Last words\n')
})

test('a note reopened while its last save is still on its way keeps both edits, with no conflict', async ({ mount, page, simulator }) => {
  seedResource(simulator, { id: 'r-note', title: 'Slow', body_md: '', course: 'biology' })
  await slowSaves(page, 1500)
  await mount(<StrictMode><TestProviders><ResourcesLens {...defaultProps} scope={{ courseTag: 'biology' }} /></TestProviders></StrictMode>)
  await page.getByRole('button', { name: 'Slow', exact: true }).click()
  await page.getByRole('textbox', { name: 'Slow' }).click()
  await page.keyboard.type('FIRST')
  await page.getByRole('button', { name: 'Back to resources' }).click()

  // Back in before that save is answered: the note has what was typed.
  await page.getByRole('button', { name: 'Slow', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Slow' })
  await expect(editor).toHaveText('FIRST')
  expect(simulator.db.resources[0].body_md).toBe('')
  await editor.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' SECOND')
  await expect(page.getByRole('status')).toHaveText('Saved', { timeout: 10_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(simulator.db.resources[0].body_md).toBe('FIRST SECOND\n')
})

test('a conflict in the Markdown source: the source is read-only until the student picks', async ({ mount, page, simulator }) => {
  seedResource(simulator, { id: 'r-note', title: 'Shared note', body_md: 'original', course: 'biology' })
  await mount(<StrictMode><TestProviders><ResourcesLens {...defaultProps} scope={{ courseTag: 'biology' }} /></TestProviders></StrictMode>)
  await page.getByRole('button', { name: 'Shared note', exact: true }).click()
  await page.getByRole('button', { name: 'Markdown' }).click()
  const source = page.getByRole('textbox', { name: 'Markdown source' })
  await expect(source).toHaveValue('original\n')

  Object.assign(simulator.db.resources[0], { body_md: 'from the laptop', updated_at: '2026-10-30T11:00:00.000Z' })
  await source.fill('mine')
  await expect(page.getByRole('alert')).toContainText('Changed on another device')
  await expect(source).toHaveAttribute('readonly', '')
  await source.press('End')
  await page.keyboard.type(' more')
  await expect(source).toHaveValue('mine')

  await page.getByRole('alert').getByRole('button', { name: 'Keep mine' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  expect(simulator.db.resources[0].body_md).toBe('mine')
  await expect(source).not.toHaveAttribute('readonly')
})

test('leaving a note in conflict asks first; its text is kept as "Not saved" and is there on return', async ({ mount, page, simulator }) => {
  seedResource(simulator, { id: 'r-note', title: 'Shared note', body_md: 'original', course: 'biology' })
  await mount(<StrictMode><TestProviders><ResourcesLens {...defaultProps} scope={{ courseTag: 'biology' }} /></TestProviders></StrictMode>)
  await page.getByRole('button', { name: 'Shared note', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Shared note' })
  await expect(editor).toHaveText('original')
  Object.assign(simulator.db.resources[0], { body_md: 'from the laptop', updated_at: '2026-10-30T11:00:00.000Z' })
  await editor.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' from the phone')
  await expect(page.getByRole('alert')).toContainText('Changed on another device')

  await page.getByRole('button', { name: 'Back to resources' }).click()
  const ask = page.getByRole('alert').filter({ hasText: "Your latest changes aren't saved" })
  await ask.getByRole('button', { name: 'Stay' }).click()
  await expect(ask).toHaveCount(0)
  await expect(editor).toBeVisible()

  await page.getByRole('button', { name: 'Back to resources' }).click()
  await ask.getByRole('button', { name: 'Leave' }).click()
  const row = page.getByTestId('resource-row').filter({ hasText: 'Shared note' })
  await expect(row.getByText('Not saved')).toBeVisible()
  // Closing the page now would lose it: the browser asks.
  expect(await page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true)

  await page.getByRole('button', { name: 'Shared note', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Shared note' })).toHaveText('original from the phone')
  await page.getByRole('alert').getByRole('button', { name: 'Keep mine' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  expect(simulator.db.resources[0].body_md).toBe('original from the phone\n')
  await page.getByRole('button', { name: 'Back to resources' }).click()
  await expect(row.getByText(/^Note · edited/)).toBeVisible()
})

test('the last save failing offline after leaving: the row says "Not saved", and the note has the text to save again', async ({ mount, page, simulator }) => {
  seedResource(simulator, { id: 'r-note', title: 'Offline', body_md: '', course: 'biology' })
  const online = await offlineSaves(page)
  await mount(<StrictMode><TestProviders><ResourcesLens {...defaultProps} scope={{ courseTag: 'biology' }} /></TestProviders></StrictMode>)
  await page.getByRole('button', { name: 'Offline', exact: true }).click()
  await page.getByRole('textbox', { name: 'Offline' }).click()
  await page.keyboard.type('Typed on the train')
  await page.getByRole('button', { name: 'Back to resources' }).click()
  const row = page.getByTestId('resource-row').filter({ hasText: 'Offline' })
  await expect(row.getByText('Not saved')).toBeVisible()

  await online()
  await page.getByRole('button', { name: 'Offline', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Offline' })).toHaveText('Typed on the train')
  await expect(page.getByRole('status')).toContainText("Couldn't save")
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  expect(simulator.db.resources[0].body_md).toBe('Typed on the train\n')
})

test('the page being hidden saves at once, without waiting for typing to pause', async ({ mount, page, simulator }) => {
  seedResource(simulator, { id: 'r-note', title: 'Quick', body_md: '', course: 'biology' })
  await mount(<TestProviders><ResourcesLens {...defaultProps} scope={{ courseTag: 'biology' }} /></TestProviders>)
  await page.getByRole('button', { name: 'Quick', exact: true }).click()
  await page.getByRole('textbox', { name: 'Quick' }).click()
  await page.keyboard.type('Switching apps')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  // The pause alone would take a second (the editor's 200 ms, then 800 ms).
  await expect.poll(() => simulator.db.resources[0].body_md, { timeout: 600 }).toBe('Switching apps\n')
})

test('a rename or move that fails says so', async ({ mount, page, simulator }) => {
  seedResource(simulator, { id: 'r-note', title: 'Draft', course: 'biology' })
  await offlineSaves(page)
  await mount(<TestProviders><ResourcesLens {...defaultProps} scope={{ courseTag: 'biology' }} /></TestProviders>)
  await page.getByRole('button', { name: 'More for Draft' }).click()
  await page.getByRole('button', { name: 'Rename' }).click()
  const name = page.getByRole('textbox', { name: 'New name for Draft' })
  await name.fill('Cell notes')
  await name.press('Enter')
  await expect(page.getByRole('alert')).toHaveText("Couldn't rename Draft. Try again.")

  await page.getByRole('button', { name: 'More for Draft' }).click()
  await page.getByRole('button', { name: 'Move' }).click()
  const dialog = page.getByRole('dialog', { name: 'Move Draft' })
  await dialog.getByRole('combobox', { name: 'Move to' }).selectOption({ label: BIO_LECTURE_TITLE })
  await dialog.getByRole('button', { name: 'Move' }).click()
  await expect(page.getByRole('alert')).toHaveText("Couldn't move Draft. Try again.")
  expect(simulator.db.resources[0]).toMatchObject({ title: 'Draft', course: 'biology', lecture_id: null })
})

test('deleting a note whose last save failed drops its unsaved text: nothing is left to ask about on close', async ({ mount, page, simulator }) => {
  seedResource(simulator, { id: 'r-note', title: 'Doomed', body_md: '', course: 'biology' })
  await offlineSaves(page)
  await mount(<TestProviders><ResourcesLens {...defaultProps} scope={{ courseTag: 'biology' }} /></TestProviders>)
  await page.getByRole('button', { name: 'Doomed', exact: true }).click()
  await page.getByRole('textbox', { name: 'Doomed' }).click()
  await page.keyboard.type('Never saved')
  await page.getByRole('button', { name: 'Back to resources' }).click()
  const row = page.getByTestId('resource-row').filter({ hasText: 'Doomed' })
  await expect(row.getByText('Not saved')).toBeVisible()
  const asksBeforeClosing = () => page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })))
  expect(await asksBeforeClosing()).toBe(true)

  await page.getByRole('button', { name: 'More for Doomed' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect.poll(() => simulator.db.resources.length, { timeout: 8000 }).toBe(0)
  await expect.poll(asksBeforeClosing).toBe(false)
})
