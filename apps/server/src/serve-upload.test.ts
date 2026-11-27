// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { handleUploadedFile } from './serve-upload'

describe('GET /uploads/<name>', () => {
  let dir: string
  let server: Server
  let port: number

  // fetch would normalise `/uploads/.`, so send the raw path.
  const get = (rawPath: string) =>
    new Promise<{ status: number; type?: string; body: string }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: rawPath }, (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, type: res.headers['content-type'], body }))
      })
      req.on('error', reject)
      req.end()
    })

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pls-serve-upload-'))
    process.env.UPLOADS_DIR = dir
    await writeFile(path.join(dir, 'a.wav'), 'RIFFdata')
    await mkdir(path.join(dir, 'resources'))
    server = createServer(handleUploadedFile)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  })

  it('serves a file with its audio type', async () => {
    expect(await get('/uploads/a.wav')).toMatchObject({ status: 200, type: 'audio/wav', body: 'RIFFdata' })
  })

  it('answers 404 for a folder (the uploads folder itself, or resources/) and keeps running', async () => {
    expect((await get('/uploads/.')).status).toBe(404)
    expect((await get('/uploads/resources')).status).toBe(404)
    expect((await get('/uploads/missing.wav')).status).toBe(404)
    expect((await get('/uploads/a.wav')).status).toBe(200)
  })

  it('refuses a path that leaves the folder', async () => {
    expect((await get('/uploads/..')).status).toBe(403)
  })
})
