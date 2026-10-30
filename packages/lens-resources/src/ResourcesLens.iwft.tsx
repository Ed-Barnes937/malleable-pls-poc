import type { Scope } from '@pls/lens-framework'
import { test, expect } from '../../../playwright/fixtures'
import { TestProviders } from '../../../playwright/mount-wrapper'
import type { BackendSimulator } from '../../../playwright/backend-simulator'
import type { StoredResource } from '../../../playwright/backend-simulator/in-memory-db'
import ResourcesLens from './ResourcesLens'

const defaultProps = { panelId: 'test-panel', scope: {}, config: {} }
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

test('with no course: the empty state invites adding links and notes', async ({ mount, page }) => {
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

  await page.getByRole('textbox', { name: 'Note title' }).fill('Enzymes')
  await editor.click()
  await page.keyboard.type('Lock and key')
  await expect(page.getByRole('status')).toHaveText('Saved')
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

  await page.getByRole('button', { name: 'More for Draft' }).click()
  await page.getByRole('button', { name: 'Rename' }).click()
  const name = page.getByRole('textbox', { name: 'New name for Draft' })
  await name.fill('Cell notes')
  await name.press('Enter')
  await expect(page.getByRole('button', { name: 'Cell notes', exact: true })).toBeVisible()
  await expect.poll(() => simulator.db.resources[0].title).toBe('Cell notes')

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
