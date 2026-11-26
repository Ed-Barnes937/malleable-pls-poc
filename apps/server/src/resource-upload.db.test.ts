// @vitest-environment node
/**
 * Resource files over HTTP against a real Postgres: /resource-upload,
 * resources.fileUrl and /resource-files/<id>. Opt-in like the other db tests:
 * runs only when TEST_DATABASE_URL points at a migrated database. Files go to
 * a temp UPLOADS_DIR; random users, their rows deleted afterwards. No DDL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { insertRecording } from './test-support/recordings'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('[Content_Types].xml')])
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00 This program cannot be run in DOS mode')

describe.skipIf(!TEST_DATABASE_URL)('resource files (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('./router').appRouter.createCaller>
  let server: Server
  let base: string
  let uploads: string
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  const bob = `test-bob-${randomUUID().slice(0, 8)}`
  let bioLecture: string
  let bobLecture: string
  let board: string

  const api = (userId = alice) => caller(userId)
  const filesOnDisk = () => (existsSync(path.join(uploads, 'resources')) ? readdirSync(path.join(uploads, 'resources')) : [])

  async function upload(body: Buffer, opts: { type?: string; name?: string; user?: string; headers?: Record<string, string> } = {}) {
    const res = await fetch(`${base}/resource-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': opts.type ?? 'application/pdf',
        'x-user-id': opts.user ?? alice,
        'x-file-name': encodeURIComponent(opts.name ?? 'Cells notes.pdf'),
        ...opts.headers,
      },
      body: new Uint8Array(body),
    })
    return { status: res.status, body: (await res.json()) as Record<string, any> }
  }

  beforeAll(async () => {
    uploads = await mkdtemp(path.join(tmpdir(), 'pls-resource-files-'))
    process.env.UPLOADS_DIR = uploads
    process.env.DATABASE_URL = TEST_DATABASE_URL
    db = await import('@pls/db')
    const { appRouter } = await import('./router')
    const { createAiDeps } = await import('./ai/deps')
    const { createServerExecutors } = await import('./workflows/executors')
    const { handleResourceFile, handleResourceUpload } = await import('./resource-upload')
    const ai = createAiDeps()
    const executors = createServerExecutors(ai)
    caller = (userId) => appRouter.createCaller({ userId, ai, executors })
    server = createServer((req, res) => {
      if (req.url?.startsWith('/resource-upload')) void handleResourceUpload(req, res)
      else void handleResourceFile(req, res)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await db.withUser(alice, async (tx) => {
      bioLecture = (await insertRecording(tx, { id: `rec-bio-${alice}`, userId: alice, title: 'Cells', course: 'biology' })).lectureId
    })
    await db.withUser(bob, async (tx) => {
      bobLecture = (await insertRecording(tx, { id: `rec-${bob}`, userId: bob, title: 'Bob', course: 'biology' })).lectureId
    })
    board = (await api().workspaces.create({ name: `Board ${alice}`, courseTag: 'biology' })).id as string
  })

  afterAll(async () => {
    await new Promise((resolve) => server?.close(resolve))
    if (db) {
      for (const table of ['job_runs', 'workflow_jobs', 'workflows', 'resources', 'workspace_scopes', 'workspace_panels', 'workspaces', 'lectures']) {
        await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [[alice, bob]])
      }
      await db.sql.end()
    }
    await rm(uploads, { recursive: true, force: true })
  })

  it('stores a PDF under a generated key, keeping its name, and serves it back from a signed link', async () => {
    const { status, body } = await upload(PDF, { name: 'Cells notes.pdf', headers: { 'x-resource-course': 'biology' } })
    expect(status).toBe(200)
    expect(body).toMatchObject({
      kind: 'file', title: 'Cells notes', file_name: 'Cells notes.pdf', mime_type: 'application/pdf',
      size_bytes: PDF.length, course: 'biology', lecture_id: null,
    })
    expect(body).not.toHaveProperty('file_key')
    expect(filesOnDisk()).toHaveLength(1)
    const [row] = await db.sql`SELECT file_key FROM resources WHERE id = ${body.id}`
    expect(row.file_key).toMatch(/^[0-9a-f-]{36}$/)
    expect(filesOnDisk()).toEqual([row.file_key])

    const { url } = await api().resources.fileUrl(body.id)
    const res = await fetch(`${base}${url}`)
    expect(res.status).toBe(200)
    expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe('sandbox')
    expect(res.headers.get('content-disposition')).toMatch(/^inline; filename="Cells notes.pdf"/)
  })

  it('serves Office files and text as downloads, and images inline', async () => {
    const docx = await upload(DOCX, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'Essay.docx' })
    const png = await upload(PNG, { type: 'image/png', name: 'Diagram.png' })
    const md = await upload(Buffer.from('# Hi\n'), { type: 'text/markdown', name: 'notes.md' })
    for (const [made, disposition, type] of [
      [docx, 'attachment', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      [png, 'inline', 'image/png'],
      [md, 'attachment', 'text/markdown; charset=utf-8'],
    ] as const) {
      expect(made.status).toBe(200)
      const res = await fetch(`${base}${(await api().resources.fileUrl(made.body.id)).url}`)
      expect(res.headers.get('content-disposition')).toMatch(new RegExp(`^${disposition};`))
      expect(res.headers.get('content-type')).toBe(type)
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    }
  })

  it('refuses a type that is not allowed, and content that is not the type it claims', async () => {
    const before = filesOnDisk().length
    expect((await upload(PDF, { type: 'text/html' })).status).toBe(415)
    expect((await upload(PDF, { type: 'image/svg+xml' })).status).toBe(415)
    const fake = await upload(EXE, { type: 'application/pdf', name: 'virus.pdf' })
    expect(fake.status).toBe(415)
    expect(fake.body.error).toMatch(/isn't a valid PDF file/)
    expect((await upload(Buffer.alloc(0))).status).toBe(400)
    expect(filesOnDisk()).toHaveLength(before)
    expect(await db.withUser(alice, (tx) => tx`SELECT 1 FROM resources WHERE file_name = 'virus.pdf'`)).toHaveLength(0)
  })

  it('refuses more than 20 MB with a 413, before and while reading', async () => {
    const before = filesOnDisk().length
    const big = Buffer.concat([PDF, Buffer.alloc(20 * 1024 * 1024)])
    const declared = await upload(big)
    expect(declared.status).toBe(413)
    // No declared length: the body itself is counted.
    const streamed = await new Promise<number>((resolve, reject) => {
      const chunks = (function* () { for (let i = 0; i < 21; i++) yield Buffer.alloc(1024 * 1024) })()
      const url = new URL(`${base}/resource-upload`)
      import('node:http').then(({ request }) => {
        const req = request({ host: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers: { 'content-type': 'application/pdf', 'x-user-id': alice, 'transfer-encoding': 'chunked' } },
          (res) => { resolve(res.statusCode ?? 0); res.resume() })
        req.on('error', reject)
        for (const c of chunks) req.write(c)
        req.end()
      })
    }).catch(() => 413)
    expect(streamed).toBe(413)
    expect(filesOnDisk()).toHaveLength(before)
  })

  it('files under a lecture, runs the board, and refuses another student\'s lecture or a bad attachment', async () => {
    const mine = await upload(PDF, { headers: { 'x-lecture-id': bioLecture, 'x-workspace-id': board } })
    expect(mine).toMatchObject({ status: 200, body: { lecture_id: bioLecture, course: null, lecture_title: 'Cells' } })

    const before = filesOnDisk().length
    const theirs = await upload(PDF, { headers: { 'x-lecture-id': bobLecture } })
    expect(theirs.status).toBe(404)
    expect((await upload(PDF, { user: bob, headers: { 'x-workspace-id': board } })).status).toBe(404)
    expect((await upload(PDF, { headers: { 'x-lecture-id': bioLecture, 'x-resource-course': 'biology' } })).status).toBe(400)
    expect((await upload(PDF, { headers: { 'x-resource-course': 'history' } })).status).toBe(400)
    expect(filesOnDisk()).toHaveLength(before)
    expect(await db.withUser(bob, (tx) => tx`SELECT 1 FROM resources WHERE user_id = ${bob}`)).toHaveLength(0)
  })

  it('hands out links only for the student\'s own files', async () => {
    const { body } = await upload(PDF)
    await expect(api(bob).resources.fileUrl(body.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(api().resources.fileUrl('res-missing')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const link = await api().resources.createLink({ url: 'https://example.com' })
    await expect(api().resources.fileUrl(link.id)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('refuses a tampered or expired link, and a link for a file read as someone else', async () => {
    const { body } = await upload(PDF)
    const { url } = await api().resources.fileUrl(body.id)
    const get = (u: string) => fetch(`${base}${u}`).then((r) => r.status)

    expect(await get(url)).toBe(200)
    expect(await get(url.replace(/sig=[^&]+/, 'sig=AAAA'))).toBe(403)
    expect(await get(url.replace(/u=[^&]+/, `u=${bob}`))).toBe(403)
    expect(await get(url.replace(/exp=\d+/, 'exp=1'))).toBe(403)
    expect(await get(url.replace(/\?.*/, ''))).toBe(403)
    expect(await get(`/resource-files/${body.id}x?${url.split('?')[1]}`)).toBe(403)
    expect(await get(`/resource-files/..%2F..%2Fetc%2Fpasswd?${url.split('?')[1]}`)).toBe(403)

    const { signFileUrl } = await import('./file-url')
    // Signed for bob, so read as bob: not his row, so 404.
    expect(await get(signFileUrl(body.id, bob))).toBe(404)
    // Signed five minutes ago and a second: expired.
    expect(await get(signFileUrl(body.id, alice, Date.now() - 5 * 60_000 - 1000))).toBe(403)
  })

  it('removes the file when the resource is deleted, and the link then 404s', async () => {
    const { body } = await upload(PDF)
    const { url } = await api().resources.fileUrl(body.id)
    const [{ file_key }] = await db.sql`SELECT file_key FROM resources WHERE id = ${body.id}`
    expect(filesOnDisk()).toContain(file_key)

    await expect(api(bob).resources.delete(body.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(filesOnDisk()).toContain(file_key)
    await api().resources.delete(body.id)
    expect(filesOnDisk()).not.toContain(file_key)
    expect((await fetch(`${base}${url}`)).status).toBe(404)
  })

  it('removes the files of a deleted lecture\'s resources after the delete', async () => {
    const lecture = await db.withUser(alice, async (tx) =>
      (await insertRecording(tx, { id: `rec-del-${alice}`, userId: alice, title: 'Gone', course: 'biology' })).lectureId)
    const kept = await upload(PDF, { headers: { 'x-resource-course': 'biology' } })
    const inLecture = await upload(PDF, { headers: { 'x-lecture-id': lecture } })
    const [{ file_key: lectureFile }] = await db.sql`SELECT file_key FROM resources WHERE id = ${inLecture.body.id}`
    const [{ file_key: keptFile }] = await db.sql`SELECT file_key FROM resources WHERE id = ${kept.body.id}`

    const preview = await api().lectures.deletePreview(lecture)
    expect(preview.resources).toEqual({ count: 1, files: 1 })
    await api().lectures.delete({ id: lecture, fingerprint: preview.fingerprint })
    expect(filesOnDisk()).not.toContain(lectureFile)
    expect(filesOnDisk()).toContain(keptFile)
  })
})
