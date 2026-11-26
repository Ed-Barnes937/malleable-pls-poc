import path from 'path'
import { unlink } from 'fs/promises'
import { removeResourceFiles, uploadsDir } from './file-store'

export { uploadsDir }

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
 * audio, and its resources' files by their `FileStore` keys. Run after the delete commits, never before: a rolled
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
  await removeResourceFiles(files.resourceFileKeys)
}
