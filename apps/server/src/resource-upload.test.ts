// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { RESOURCE_FILE_TYPES, matchesFileContent, resourceFileTypeByMime, type ResourceFileType } from '@pls/substrate'
import { createDiskFileStore, isFileKey, newFileKey } from './file-store'
import { FILE_URL_TTL_MS, signFileUrl, verifyFileUrl } from './file-url'
import { cleanFileName, contentDisposition } from './resource-upload'

const type = (mime: string): ResourceFileType => resourceFileTypeByMime(mime)!
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....[Content_Types].xml....')])

describe('matchesFileContent', () => {
  it('accepts each allowed type by its signature', () => {
    expect(matchesFileContent(type('application/pdf'), Buffer.from('%PDF-1.7\n...'))).toBe(true)
    expect(matchesFileContent(type('image/png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(true)
    expect(matchesFileContent(type('image/jpeg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe(true)
    for (const mime of RESOURCE_FILE_TYPES.map((t) => t.mime).filter((m) => m.includes('openxmlformats'))) {
      expect(matchesFileContent(type(mime), ZIP)).toBe(true)
    }
    expect(matchesFileContent(type('text/plain'), Buffer.from('héllo\nworld'))).toBe(true)
    expect(matchesFileContent(type('text/markdown'), Buffer.from('# Title\n'))).toBe(true)
  })

  it('refuses content that is not what it claims to be', () => {
    const exe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00 This program cannot be run in DOS mode')
    for (const t of RESOURCE_FILE_TYPES) expect(matchesFileContent(t, exe), t.mime).toBe(false)
    // A plain zip is not an Office document.
    expect(matchesFileContent(type('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0]))).toBe(false)
    // Text with a NUL byte, or not UTF-8, is binary.
    expect(matchesFileContent(type('text/plain'), Buffer.from('ab\0cd'))).toBe(false)
    expect(matchesFileContent(type('text/markdown'), Buffer.from([0xff, 0xfe, 0xfd]))).toBe(false)
    expect(matchesFileContent(type('application/pdf'), Buffer.alloc(0))).toBe(false)
  })
})

describe('signed file links', () => {
  const link = (u: string) => new URL(u, 'http://x')
  const verify = (u: string, id: string, now?: number) => {
    const url = link(u)
    return verifyFileUrl(id, url.searchParams, now)
  }

  it('verify for the student they were made for, until they expire', () => {
    const now = 1_000_000
    const url = signFileUrl('res-1', 'alice', now)
    expect(url).toMatch(/^\/resource-files\/res-1\?/)
    expect(verify(url, 'res-1', now + 1000)).toBe('alice')
    expect(verify(url, 'res-1', now + FILE_URL_TTL_MS)).toBe('alice')
    expect(verify(url, 'res-1', now + FILE_URL_TTL_MS + 1)).toBeNull()
  })

  it('refuse a link with its id, student, expiry or signature changed', () => {
    const now = Date.now()
    const url = signFileUrl('res-1', 'alice', now)
    const params = link(url).searchParams
    expect(verifyFileUrl('res-2', params, now)).toBeNull()
    for (const [name, value] of [['u', 'bob'], ['exp', String(now + 10 * FILE_URL_TTL_MS)], ['sig', 'AAAA'], ['sig', '']]) {
      const altered = new URLSearchParams(params)
      altered.set(name, value)
      expect(verifyFileUrl('res-1', altered, now), `${name}=${value}`).toBeNull()
    }
    const missing = new URLSearchParams(params)
    missing.delete('sig')
    expect(verifyFileUrl('res-1', missing, now)).toBeNull()
  })
})

describe('disk file store', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pls-filestore-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  const read = async (stream: NodeJS.ReadableStream) => {
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    return Buffer.concat(chunks)
  }

  it('puts, streams and deletes by key, and a missing file is null or fine', async () => {
    const store = createDiskFileStore(() => path.join(dir, 'files'))
    const key = newFileKey()
    expect(await store.stream(key)).toBeNull()
    await store.put(key, Buffer.from('hello'))
    const file = (await store.stream(key))!
    expect(file.size).toBe(5)
    expect((await read(file.stream)).toString()).toBe('hello')
    await store.delete(key)
    expect(await store.stream(key)).toBeNull()
    await store.delete(key)
  })

  it('refuses anything but a generated key, so no client path reaches the disk', async () => {
    const store = createDiskFileStore(() => dir)
    await writeFile(path.join(dir, 'secret.txt'), 'x')
    for (const key of ['../secret.txt', 'secret.txt', '/etc/passwd', `${newFileKey()}/../x`, '', '..']) {
      expect(isFileKey(key), key).toBe(false)
      await expect(store.put(key, Buffer.from('y'))).rejects.toThrow('Not a file key')
      await expect(store.stream(key)).rejects.toThrow('Not a file key')
      await expect(store.delete(key)).rejects.toThrow('Not a file key')
    }
    expect(await readdir(dir)).toEqual(['secret.txt'])
  })
})

describe('file names', () => {
  it('drop folders and control characters, and are never empty', () => {
    expect(cleanFileName('../../etc/passwd')).toBe('passwd')
    expect(cleanFileName('C:\\Users\\me\\notes.pdf')).toBe('notes.pdf')
    expect(cleanFileName('a\r\nb.pdf')).toBe('ab.pdf')
    expect(cleanFileName('..')).toBe('File')
    expect(cleanFileName(null)).toBe('File')
    expect(cleanFileName('é'.repeat(300))).toHaveLength(255)
  })

  it('go into a download header as an ASCII name and an encoded one', () => {
    expect(contentDisposition('attachment', 'Lecture "1" é.docx')).toBe(
      `attachment; filename="Lecture _1_ _.docx"; filename*=UTF-8''Lecture%20%221%22%20%C3%A9.docx`,
    )
    expect(contentDisposition('inline', "it's (a).pdf")).toContain("filename*=UTF-8''it%27s%20%28a%29.pdf")
  })
})
