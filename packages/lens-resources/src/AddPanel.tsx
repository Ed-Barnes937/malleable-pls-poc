import { useRef, useState, type FormEvent } from 'react'
import { cn, TextField } from '@pls/shared-ui'
import { RESOURCE_FILE_ACCEPT, parseResourceUrl, resourceFileProblem } from '@pls/substrate'
import { NotebookPen, Paperclip } from 'lucide-react'

export type AttachTo = 'lecture' | 'course'

export interface AddPanelProps {
  /** The selected lecture's title, when there is one: then the student picks where new items go. */
  lectureTitle?: string
  /** What "the whole course" is called here, e.g. "Whole course" or "No course". */
  courseChoiceLabel: string
  onAddLink: (url: string, attachTo: AttachTo) => Promise<unknown>
  onWriteNote: (attachTo: AttachTo) => void
  /** Uploads a file, calling `onProgress` with the fraction sent. Rejects with a message to show. */
  onUploadFile: (file: File, attachTo: AttachTo, onProgress: (fraction: number) => void) => Promise<unknown>
  busy: boolean
}

/**
 * Adding a resource: paste a link, write a note, or upload a file. With a lecture selected,
 * "Attach to" picks the lecture (the default) or the whole course.
 */
export function AddPanel({ lectureTitle, courseChoiceLabel, onAddLink, onWriteNote, onUploadFile, busy }: AddPanelProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [attachTo, setAttachTo] = useState<AttachTo>(lectureTitle ? 'lecture' : 'course')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!parseResourceUrl(url)) {
      setError('Links start with http:// or https://')
      return
    }
    setError(null)
    try {
      await onAddLink(url.trim(), attachTo)
      setUrl('')
    } catch {
      setError("Couldn't add that link. Try again.")
    }
  }

  const pickFile = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = ''
    if (!file) return
    const problem = resourceFileProblem(file)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setUploading({ name: file.name, progress: 0 })
    try {
      await onUploadFile(file, attachTo, (progress) => setUploading({ name: file.name, progress }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that file. Try again.")
    } finally {
      setUploading(null)
    }
  }

  const working = busy || uploading !== null

  return (
    <div className="flex flex-col gap-2 rounded-control border border-border-subtle bg-surface-inset p-2.5" data-testid="add-resource">
      {lectureTitle && (
        <fieldset className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-muted">
          <legend className="sr-only">Attach to</legend>
          <span aria-hidden>Attach to</span>
          {([['lecture', lectureTitle], ['course', courseChoiceLabel]] as const).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                'inline-flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-2.5 font-semibold',
                attachTo === value ? 'border-accent-line bg-accent-soft text-accent' : 'border-border-subtle text-text-secondary hover:bg-surface-overlay',
              )}
            >
              <input
                type="radio"
                name="attach-to"
                value={value}
                checked={attachTo === value}
                onChange={() => setAttachTo(value)}
                className="sr-only"
              />
              <span className="truncate">{value === 'lecture' ? `This lecture: ${label}` : label}</span>
            </label>
          ))}
        </fieldset>
      )}
      <form onSubmit={submit} className="flex items-center gap-2">
        <TextField
          autoFocus
          aria-label="Link to add"
          placeholder="Paste a link (Google Doc, Sheet, any page)"
          value={url}
          maxLength={2048}
          onChange={(e) => {
            setUrl(e.target.value)
            setError(null)
          }}
          aria-invalid={!!error}
          className="min-w-0"
        />
        <button
          type="submit"
          disabled={!url.trim() || working}
          className="h-10 shrink-0 rounded-control bg-accent px-3 text-body font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add link
        </button>
      </form>
      {error && <p role="alert" className="text-meta text-attn">{error}</p>}
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={working}
          onClick={() => onWriteNote(attachTo)}
          className="inline-flex h-9 items-center gap-1.5 rounded-item px-2 text-body font-semibold text-accent hover:bg-accent-soft disabled:opacity-40"
        >
          <NotebookPen className="h-4 w-4" aria-hidden />
          Write a note
        </button>
        <button
          type="button"
          disabled={working}
          onClick={() => fileInput.current?.click()}
          className="inline-flex h-9 items-center gap-1.5 rounded-item px-2 text-body font-semibold text-accent hover:bg-accent-soft disabled:opacity-40"
        >
          <Paperclip className="h-4 w-4" aria-hidden />
          Upload a file
        </button>
        <input
          ref={fileInput}
          type="file"
          hidden
          tabIndex={-1}
          accept={RESOURCE_FILE_ACCEPT}
          aria-label="File to upload"
          data-testid="resource-file-input"
          onChange={(e) => void pickFile(e.target.files?.[0])}
        />
      </div>
      {uploading && (
        <div className="flex flex-col gap-1" data-testid="resource-upload-progress">
          <div className="flex items-baseline justify-between gap-2 text-meta text-text-muted">
            <span className="truncate">Uploading {uploading.name}</span>
            <span>{Math.round(uploading.progress * 100)}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={`Uploading ${uploading.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(uploading.progress * 100)}
            className="h-1.5 overflow-hidden rounded-full bg-border-subtle"
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${uploading.progress * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}
