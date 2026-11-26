import { MAX_RESOURCE_FILE_BYTES, resourceFileProblem, resourceFileTypeByName, type ResourceWithBody } from '@pls/substrate'
import type { UploadResourceFile } from '@pls/lens-framework'

export const API_URL: string = import.meta.env?.VITE_API_URL ?? 'http://localhost:3001'
export const USER_ID: string = import.meta.env?.VITE_USER_ID ?? 'dev-user-1'
const AUTH_TOKEN = import.meta.env?.VITE_AUTH_TOKEN

/** What the student is told for each way /resource-upload can say no. */
function uploadError(status: number, serverMessage: string | undefined): Error {
  if (status === 413) return new Error(`That file is over ${MAX_RESOURCE_FILE_BYTES / 1024 / 1024} MB.`)
  if (status === 415 && serverMessage) return new Error(`${serverMessage}.`)
  if (status === 404) return new Error("Couldn't add that file: where it was going no longer exists.")
  if (status === 429) return new Error('Too many uploads. Wait a minute and try again.')
  if (status === 0) return new Error("Couldn't upload that file. Check your connection and try again.")
  return new Error("Couldn't upload that file. Try again.")
}

/**
 * POSTs one file to /resource-upload as the raw body (XMLHttpRequest, as
 * `fetch` can't report upload progress) and resolves with the resource it
 * made. The file goes up as the type its extension says, not whatever the
 * browser guessed. Rejects with an Error whose message is safe to show.
 */
export function uploadResourceFile({ file, lectureId, courseTag, onProgress, boardId }: UploadResourceFile & { boardId?: string | null }): Promise<ResourceWithBody> {
  const problem = resourceFileProblem(file)
  if (problem) return Promise.reject(new Error(problem))
  const type = resourceFileTypeByName(file.name)!

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_URL}/resource-upload`)
    const headers: Record<string, string> = {
      'Content-Type': type.mime,
      'x-user-id': USER_ID,
      // Header values must be ISO-8859-1; the server decodes this.
      'x-file-name': encodeURIComponent(file.name),
      ...(lectureId ? { 'x-lecture-id': lectureId } : courseTag ? { 'x-resource-course': courseTag } : {}),
      ...(boardId ? { 'x-workspace-id': boardId } : {}),
      ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
    }
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total))
    }
    xhr.onerror = () => reject(uploadError(0, undefined))
    xhr.onload = () => {
      let body: { error?: string } | ResourceWithBody | null = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body) {
        onProgress?.(1)
        resolve(body as ResourceWithBody)
      } else {
        reject(uploadError(xhr.status, (body as { error?: string } | null)?.error))
      }
    }
    xhr.send(file)
  })
}
