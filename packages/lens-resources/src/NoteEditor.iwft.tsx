import { test, expect } from '../../../playwright/fixtures'
import NoteEditor from './NoteEditor'

const noop = () => {}

/** The note's markdown as the editor would save it now, via the Markdown toggle (and back). */
async function sourceOf(page: import('@playwright/test').Page): Promise<string> {
  await page.getByRole('button', { name: 'Markdown' }).click()
  const text = await page.getByRole('textbox', { name: 'Markdown source' }).inputValue()
  await page.getByRole('button', { name: 'Markdown' }).click()
  return text
}

const CORPUS = [
  '## Krebs cycle',
  '',
  'The **citric acid** cycle is *central* to `respiration` and ~~optional~~.',
  '',
  '- one',
  '- two',
  '',
  '1. first',
  '2. second',
  '',
  '- [ ] learn the steps',
  '- [x] draw it',
  '',
  '> a quote',
  '',
  '```',
  'code here',
  '```',
  '',
  '***',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  '',
  'See [notes](https://example.com).',
].join('\n')

test('renders every supported kind of content from markdown', async ({ mount, page }) => {
  await mount(<NoteEditor value={CORPUS} onChange={noop} />)
  const doc = page.getByRole('textbox', { name: 'Note' })
  await expect(doc.locator('h2')).toHaveText('Krebs cycle')
  await expect(doc.locator('strong')).toHaveText('citric acid')
  await expect(doc.locator('em')).toHaveText('central')
  await expect(doc.locator('code').first()).toHaveText('respiration')
  await expect(doc.locator('del')).toHaveText('optional')
  await expect(doc.locator('ol li')).toHaveCount(2)
  await expect(doc.locator('li[data-item-type="task"]')).toHaveCount(2)
  await expect(doc.locator('li[data-checked="true"]')).toHaveText('draw it')
  await expect(doc.locator('blockquote')).toHaveText('a quote')
  await expect(doc.locator('pre')).toContainText('code here')
  await expect(doc.locator('hr')).toHaveCount(1)
  await expect(doc.locator('table td')).toHaveCount(2)
  const link = doc.getByRole('link', { name: 'notes' })
  await expect(link).toHaveAttribute('href', 'https://example.com')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
})

test('markdown round-trips: stable after one pass, meaning kept', async ({ mount, page }) => {
  await mount(<NoteEditor value={CORPUS} onChange={noop} />)
  await expect(page.getByRole('textbox', { name: 'Note' }).locator('h2')).toBeVisible()
  const once = await sourceOf(page)
  const twice = await sourceOf(page)
  expect(twice).toBe(once)
  for (const kept of ['## Krebs cycle', '**citric acid**', '*central*', '`respiration`', '~~optional~~', '- [ ] learn the steps', '- [x] draw it', '> a quote', 'code here', '[notes](https://example.com)', '| a | b |']) {
    expect(once).toContain(kept)
  }
})

test('raw HTML shows as escaped text and stays in the source; images are a link, kept in the source', async ({ mount, page }) => {
  const value = 'Before <img src="x" onerror="window.__pwned = 1"> after\n\n<script>window.__pwned = 2</script>\n\n![diagram](https://example.com/d.png)'
  await mount(<NoteEditor value={value} onChange={noop} />)
  const doc = page.getByRole('textbox', { name: 'Note' })
  await expect(doc).toContainText('<img src="x"')
  // ProseMirror's own cursor helpers are images with a class; no other image is in the page.
  await expect(doc.locator('img:not(.ProseMirror-separator)')).toHaveCount(0)
  await expect(doc.locator('script')).toHaveCount(0)
  await expect(doc.getByRole('link', { name: 'Image: diagram' })).toHaveAttribute('href', 'https://example.com/d.png')
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
  const source = await sourceOf(page)
  expect(source).toContain('<img src="x" onerror="window.__pwned = 1">')
  expect(source).toContain('![diagram](https://example.com/d.png)')
})

test('links with other schemes are not rendered as links', async ({ mount, page }) => {
  await mount(<NoteEditor value={'[bad](javascript:alert(1)) [data](data:text/html,hi) [mail](mailto:a@b.test)'} onChange={noop} />)
  const doc = page.getByRole('textbox', { name: 'Note' })
  await expect(doc.getByText('bad')).toBeVisible()
  await expect(doc.locator('a[href^="javascript"], a[href^="data"]')).toHaveCount(0)
  await expect(doc.getByRole('link', { name: 'mail' })).toHaveAttribute('href', 'mailto:a@b.test')
})

test('the toolbar formats and says what is on (aria-pressed)', async ({ mount, page }) => {
  const changes: string[] = []
  await mount(<NoteEditor value="" onChange={(md) => changes.push(md)} />)
  const doc = page.getByRole('textbox', { name: 'Note' })
  const bold = page.getByRole('button', { name: 'Bold' })
  await expect(bold).toBeEnabled()
  await doc.click()
  await expect(bold).toHaveAttribute('aria-pressed', 'false')
  await bold.click()
  await expect(bold).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.type('Important')
  await expect(doc.locator('strong')).toHaveText('Important')

  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Task list' }).click()
  await expect(page.getByRole('button', { name: 'Task list' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.type('Revise')
  await expect.poll(() => changes.at(-1)).toContain('- [ ] Revise')

  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Heading' }).click()
  await page.keyboard.type('Summary')
  await expect(doc.locator('h2')).toHaveText('Summary')
  await expect(page.getByRole('button', { name: 'Heading' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => changes.at(-1)).toContain('## Summary')
})

test('a top-level heading typed becomes a section heading', async ({ mount, page }) => {
  await mount(<NoteEditor value="" onChange={noop} />)
  const doc = page.getByRole('textbox', { name: 'Note' })
  await doc.click()
  await page.keyboard.type('# Title')
  await expect(doc.locator('h2')).toHaveText('Title')
  await expect(doc.locator('h1')).toHaveCount(0)
})

test('Markdown toggle: edit the source, switch back, see it formatted', async ({ mount, page }) => {
  const changes: string[] = []
  await mount(<NoteEditor value="plain" onChange={(md) => changes.push(md)} />)
  await page.getByRole('button', { name: 'Markdown' }).click()
  await expect(page.getByRole('button', { name: 'Markdown' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Bold' })).toBeDisabled()
  const source = page.getByRole('textbox', { name: 'Markdown source' })
  await expect(source).toHaveValue('plain\n')
  await source.fill('**bold** and _it_')
  await expect.poll(() => changes.at(-1)).toBe('**bold** and _it_')
  await page.getByRole('button', { name: 'Markdown' }).click()
  const doc = page.getByRole('textbox', { name: 'Note' })
  await expect(doc.locator('strong')).toHaveText('bold')
  await expect(doc.locator('em')).toHaveText('it')
  await expect(source).toHaveCount(0)
})

test('adds a link from the toolbar, only for safe addresses', async ({ mount, page }) => {
  const changes: string[] = []
  await mount(<NoteEditor value="" onChange={(md) => changes.push(md)} />)
  await page.getByRole('textbox', { name: 'Note' }).click()
  await page.getByRole('button', { name: 'Link' }).click()
  const address = page.getByRole('textbox', { name: 'Link address' })
  await address.fill('javascript:alert(1)')
  await expect(page.getByRole('button', { name: 'Add link' })).toBeDisabled()
  await address.fill('https://example.com/a')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(page.getByRole('textbox', { name: 'Note' }).getByRole('link')).toHaveAttribute('href', 'https://example.com/a')
  // A link whose text is its address is written as an autolink.
  await expect.poll(() => changes.at(-1)).toContain('<https://example.com/a>')
})

test('read-only shows the note without a toolbar and cannot be edited', async ({ mount, page }) => {
  await mount(<NoteEditor value="**fixed**" onChange={noop} readOnly />)
  const doc = page.getByRole('textbox', { name: 'Note' })
  await expect(doc.locator('strong')).toHaveText('fixed')
  await expect(doc).toHaveAttribute('contenteditable', 'false')
  await expect(page.getByRole('toolbar')).toHaveCount(0)
})
