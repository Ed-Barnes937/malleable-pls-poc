import path from 'path'
import { unlink } from 'fs/promises'

/** Where uploaded audio lives on disk (a Fly volume in production). Read when used, so tests can point it elsewhere. */
export function uploadsDir(): string {
  return process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads')
}

/**
 * The file on disk for a stored `audio_url` ('/uploads/<name>'), or null for
 * one that would land outside `uploadsDir()` (the same guard as the
 * /uploads route).
 */
export function uploadedAudioPath(audioUrl: string): string | null {
  const dir = path.resolve(uploadsDir())
  const filePath = path.resolve(dir, path.basename(audioUrl))
  return filePath.startsWith(dir + path.sep) ? filePath : null
}

/**
 * Removes the files of a lecture that has been deleted: its recordings'
 * audio, and (once uploads land, 04 PR B) its resources' files by their
 * `FileStore` keys. Run after the delete commits, never before: a rolled
 * back delete keeps its files. Failures are logged, not thrown: the rows are
 * gone, so a file left behind is unreachable and harmless.
 */
export async function removeLectureFiles(files: { audioUrls: string[]; resourceFileKeys: string[] }): Promise<void> {
  await Promise.all(files.audioUrls.map(async (audioUrl) => {
    const filePath = uploadedAudioPath(audioUrl)
    if (!filePath) return
    try {
      await unlink(filePath)
    } catch (err) {
      // Already gone is what was wanted.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`Couldn't remove ${filePath}:`, err)
    }
  }))
  // No resource has a file until 04 PR B adds uploads and `FileStore`; it
  // deletes each of these keys with `FileStore.delete` here.
  if (files.resourceFileKeys.length > 0) {
    console.error(`Resource files left on disk (no FileStore yet): ${files.resourceFileKeys.join(', ')}`)
  }
}
