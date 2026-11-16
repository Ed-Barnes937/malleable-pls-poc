import { createReadStream } from 'fs'
import { mkdir, stat, unlink, writeFile } from 'fs/promises'
import path from 'path'
import type { Readable } from 'stream'

/** Where uploaded files live on disk (a Fly volume in production). Read when used, so tests can point it elsewhere. */
export function uploadsDir(): string {
  return process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads')
}

/**
 * Where resource files live, behind one small seam: the local disk today
 * (a Fly volume in production), object storage later as one more
 * implementation. A key is made by the server (`newFileKey`), never taken
 * from a client, and every implementation refuses anything else.
 */
export interface FileStore {
  put(key: string, data: Buffer): Promise<void>
  /** The file's bytes and size, or null if there is no such file. */
  stream(key: string): Promise<{ stream: Readable; size: number } | null>
  /** Removes the file; one that is already gone is fine. */
  delete(key: string): Promise<void>
}

const KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function newFileKey(): string {
  return crypto.randomUUID()
}

export function isFileKey(key: string): boolean {
  return KEY_RE.test(key)
}

/**
 * Files in `dir()/resources/<key>`. A subfolder of the uploads folder, so the
 * open `/uploads/<name>` route (which serves that folder's own files by name)
 * can never reach them. `dir` is read when used, so tests can point it elsewhere.
 */
export function createDiskFileStore(dir: () => string = () => path.join(uploadsDir(), 'resources')): FileStore {
  const pathOf = (key: string): string => {
    if (!isFileKey(key)) throw new Error('Not a file key')
    return path.join(dir(), key)
  }
  return {
    async put(key, data) {
      const filePath = pathOf(key)
      await mkdir(dir(), { recursive: true })
      await writeFile(filePath, data, { flag: 'wx' })
    },
    async stream(key) {
      const filePath = pathOf(key)
      try {
        const { size } = await stat(filePath)
        return { stream: createReadStream(filePath), size }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw err
      }
    },
    async delete(key) {
      try {
        await unlink(pathOf(key))
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      }
    },
  }
}

let current: FileStore | undefined

/** The store the server uses. */
export function fileStore(): FileStore {
  return (current ??= createDiskFileStore())
}

/** Removes the files behind resources that were deleted, after the delete committed. Failures are logged: the rows are gone, so a leftover file is unreachable. */
export async function removeResourceFiles(keys: string[], store: FileStore = fileStore()): Promise<void> {
  await Promise.all(keys.map(async (key) => {
    try {
      await store.delete(key)
    } catch (err) {
      console.error(`Couldn't remove resource file ${key}:`, err)
    }
  }))
}
