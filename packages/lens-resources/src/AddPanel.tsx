import { useState, type FormEvent } from 'react'
import { cn, TextField } from '@pls/shared-ui'
import { parseResourceUrl } from '@pls/substrate'
import { NotebookPen } from 'lucide-react'

export type AttachTo = 'lecture' | 'course'

export interface AddPanelProps {
  /** The selected lecture's title, when there is one: then the student picks where new items go. */
  lectureTitle?: string
  /** What "the whole course" is called here, e.g. "Whole course" or "No course". */
  courseChoiceLabel: string
  onAddLink: (url: string, attachTo: AttachTo) => Promise<unknown>
  onWriteNote: (attachTo: AttachTo) => void
  busy: boolean
}

/**
 * Adding a resource: paste a link, or write a note. With a lecture selected,
 * "Attach to" picks the lecture (the default) or the whole course.
 */
export function AddPanel({ lectureTitle, courseChoiceLabel, onAddLink, onWriteNote, busy }: AddPanelProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
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
          disabled={!url.trim() || busy}
          className="h-10 shrink-0 rounded-control bg-accent px-3 text-body font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add link
        </button>
      </form>
      {error && <p role="alert" className="text-meta text-attn">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => onWriteNote(attachTo)}
        className="inline-flex h-9 items-center gap-1.5 self-start rounded-item px-2 text-body font-semibold text-accent hover:bg-accent-soft disabled:opacity-40"
      >
        <NotebookPen className="h-4 w-4" aria-hidden />
        Write a note
      </button>
    </div>
  )
}
