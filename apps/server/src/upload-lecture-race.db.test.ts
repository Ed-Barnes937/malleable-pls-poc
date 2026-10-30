// @vitest-environment node
/**
 * /upload into a lecture that goes between the route's ownership check and
 * the insert's transaction: still a 404, and the written file is removed.
 * The race is made deterministic by deleting the lecture inside the insert's
 * transaction, just before the route re-checks it. Opt-in like the other db
 * tests: runs only when TEST_DATABASE_URL points at a migrated database.
 *
 * Fresh random user id; rows deleted afterwards. No DDL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

/** A minimal WAV header: enough for /upload's magic-byte check. */
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(16)])

// The lecture vanishes just as the insert's transaction looks it up.
vi.mock('./routers/_shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./routers/_shared')>()
  return {
    ...actual,
    requireOwnLecture: async (...args: Parameters<typeof actual.requireOwnLecture>) => {
      const [tx, userId, lectureId] = args
      await tx`DELETE FROM lectures WHERE id = ${lectureId} AND user_id = ${userId}`
      return actual.requireOwnLecture(...args)
    },
  }
})

describe.skipIf(!TEST_DATABASE_URL)('/upload when the lecture goes mid-upload (Postgres)', () => {
  let db: typeof import('@pls/db')
  let handleUpload: typeof import('./upload').handleUpload
  let uploadsDir: string
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  let lectureId: string

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'pls-uploads-'))
    process.env.UPLOADS_DIR = uploadsDir
    db = await import('@pls/db')
    handleUpload = (await import('./upload')).handleUpload
    lectureId = (await db.withUser(alice, (tx) => tx`
      INSERT INTO lectures (user_id, title, course) VALUES (${alice}, 'Cells', 'biology') RETURNING id
    `))[0].id as string
  })

  afterAll(async () => {
    if (db) {
      for (const table of ['job_runs', 'workflow_jobs', 'workflows', 'user_provisioning', 'workspaces', 'lectures']) {
        await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [[alice]])
      }
      await db.sql.end()
    }
    if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true })
  })

  it('is a 404, records nothing and leaves no file behind', async () => {
    const req = Object.assign(Readable.from([WAV]), {
      method: 'POST',
      headers: { 'content-type': 'audio/wav', 'x-user-id': alice, 'x-recording-title': 'Part', 'x-lecture-id': lectureId },
    }) as unknown as IncomingMessage
    let status = 0
    const res = {
      writeHead: (code: number) => { status = code },
      end: () => {},
    } as unknown as ServerResponse
    await handleUpload(req, res)

    expect(status).toBe(404)
    expect(await readdir(uploadsDir)).toEqual([])
    const recordings = await db.withUser(alice, (tx) => tx`SELECT id FROM recordings WHERE user_id = ${alice}`)
    expect(recordings).toHaveLength(0)
  })
})
