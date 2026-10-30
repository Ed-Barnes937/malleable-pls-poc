import { describe, expect, it } from 'vitest'
import { noteExcerpt, parseResourceUrl, resourceCourse, resourceLinkLabel, resourceUpdateInput } from './resources'

const kindOf = (url: string) => {
  const parsed = parseResourceUrl(url)
  return parsed && [parsed.provider, parsed.label]
}

describe('parseResourceUrl', () => {
  it.each([
    ['https://docs.google.com/document/d/1AbC_d-9/edit', 'google_doc', 'Google Doc'],
    ['https://docs.google.com/document/d/1AbC/edit?usp=sharing', 'google_doc', 'Google Doc'],
    ['https://docs.google.com/document/u/0/d/1AbC/view', 'google_doc', 'Google Doc'],
    ['https://docs.google.com/document/d/1AbC/mobilebasic', 'google_doc', 'Google Doc'],
    ['https://docs.google.com/spreadsheets/d/1XyZ/edit#gid=0', 'google_sheet', 'Google Sheet'],
    ['https://docs.google.com/spreadsheets/u/1/d/1XyZ/edit?usp=sharing#gid=123', 'google_sheet', 'Google Sheet'],
    ['https://docs.google.com/presentation/d/1Pq/edit#slide=id.p', 'google_slides', 'Google Slides'],
    ['https://docs.google.com/presentation/d/1Pq/view', 'google_slides', 'Google Slides'],
    ['https://docs.google.com/forms/d/1Fm/edit', 'google_form', 'Google Form'],
    ['https://docs.google.com/forms/d/e/1FAIpQ/viewform?usp=sf_link', 'google_form', 'Google Form'],
    ['https://drive.google.com/file/d/1Dr/view?usp=sharing', 'google_drive', 'Drive file'],
    ['https://drive.google.com/open?id=1Dr', 'google_drive', 'Drive file'],
    ['https://drive.google.com/drive/folders/1Fo', 'google_drive', 'Drive folder'],
    ['https://drive.google.com/drive/u/0/folders/1Fo?usp=sharing', 'google_drive', 'Drive folder'],
    ['HTTPS://DOCS.GOOGLE.COM/document/d/1AbC/edit', 'google_doc', 'Google Doc'],
  ])('recognises %s', (url, provider, label) => {
    expect(kindOf(url)).toEqual([provider, label])
  })

  it.each([
    ['https://www.khanacademy.org/science/biology', 'khanacademy.org'],
    ['http://example.com', 'example.com'],
    // Lookalike hosts are plain web links.
    ['https://docs.google.com.evil.example/document/d/1AbC', 'docs.google.com.evil.example'],
    ['https://evil.example/docs.google.com/document/d/1AbC', 'evil.example'],
    // Google hosts without a file path are plain web links.
    ['https://docs.google.com/', 'docs.google.com'],
    ['https://drive.google.com/drive/my-drive', 'drive.google.com'],
  ])('labels %s by its host', (url, host) => {
    expect(kindOf(url)).toEqual(['web', host])
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://example.com/file',
    'mailto:someone@example.com',
    'docs.google.com/document/d/1AbC',
    '/relative/path',
    'not a url',
    '',
    '   ',
    'http://',
    `https://example.com/${'a'.repeat(2048)}`,
  ])('rejects %j', (url) => {
    expect(parseResourceUrl(url)).toBeNull()
  })

  it('trims and normalises', () => {
    expect(parseResourceUrl('  https://Example.com/a b ')).toMatchObject({ url: 'https://example.com/a%20b', hostname: 'example.com' })
  })
})

describe('resourceLinkLabel', () => {
  it('labels a link from its URL, with a fallback', () => {
    expect(resourceLinkLabel('https://docs.google.com/spreadsheets/d/1/edit')).toBe('Google Sheet')
    expect(resourceLinkLabel('https://www.bbc.co.uk/bitesize')).toBe('bbc.co.uk')
    expect(resourceLinkLabel(null)).toBe('Link')
  })
})

describe('noteExcerpt', () => {
  it('strips markdown to plain text', () => {
    const md = [
      '## Krebs cycle',
      '',
      'The **citric acid** cycle is _central_ to `respiration`. See [notes](https://example.com).',
      '',
      '- [ ] learn the steps',
      '- [x] draw it',
      '1. Acetyl CoA',
      '> a quote',
      '',
      '```',
      'code here',
      '```',
      '---',
      '| a | b |',
      '| --- | --- |',
      '![diagram](https://example.com/x.png)',
      '<b>raw</b>',
    ].join('\n')
    expect(noteExcerpt(md, 500)).toBe(
      'Krebs cycle The citric acid cycle is central to respiration. See notes. learn the steps draw it Acetyl CoA a quote code here a b diagram raw',
    )
  })

  it('cuts long text on a word break', () => {
    const excerpt = noteExcerpt('word '.repeat(100), 30)
    expect(excerpt.endsWith('…')).toBe(true)
    expect(excerpt.length).toBeLessThanOrEqual(31)
    expect(excerpt).not.toMatch(/wor…$/)
  })

  it('is empty for an empty note', () => {
    expect(noteExcerpt('')).toBe('')
  })
})

describe('resourceCourse', () => {
  it("is the lecture's course for a lecture resource, else its own", () => {
    expect(resourceCourse({ lecture_id: 'l1', lecture_course: 'biology', course: null })).toBe('biology')
    expect(resourceCourse({ lecture_id: null, lecture_course: null, course: 'chemistry' })).toBe('chemistry')
    expect(resourceCourse({ lecture_id: null, lecture_course: null, course: null })).toBeNull()
  })
})

describe('resourceUpdateInput', () => {
  it('takes expectedUpdatedAt as a Date or an ISO string', () => {
    const at = new Date('2026-10-30T10:00:00.123Z')
    expect(resourceUpdateInput.parse({ id: 'r', patch: {}, expectedUpdatedAt: at }).expectedUpdatedAt).toEqual(at)
    expect(resourceUpdateInput.parse({ id: 'r', patch: {}, expectedUpdatedAt: at.toISOString() }).expectedUpdatedAt).toEqual(at)
    expect(() => resourceUpdateInput.parse({ id: 'r', patch: {}, expectedUpdatedAt: 'yesterday' })).toThrow()
  })
})
