import { lazy, Suspense, useState } from 'react'
import { useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { cn, IconButton, Spinner } from '@pls/shared-ui'
import { MAX_RESOURCE_TITLE_LENGTH, type ResourceWithBody } from '@pls/substrate'
import { ArrowLeft } from 'lucide-react'
import { useNoteSaver, type SaveStatus } from './useNoteSaver'

// Loaded on the first note opened, so the list never pays for the editor.
const NoteEditor = lazy(() => import('./NoteEditor'))

const STATUS_LABEL: Partial<Record<SaveStatus, string>> = {
  unsaved: 'Saving…',
  saving: 'Saving…',
  saved: 'Saved',
  failed: "Couldn't save",
}

export interface NoteViewProps {
  noteId: string
  /** Back to the list; absent when the host (the phone dialog) closes it. */
  onBack?: () => void
}

export function NoteView({ noteId, onBack }: NoteViewProps) {
  const { data: note, isLoading } = useSubstrate().useResource(noteId)
  if (!note) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        {onBack && <IconButton icon={ArrowLeft} label="Back to resources" onClick={onBack} />}
        <div className="flex flex-1 items-center justify-center text-body text-text-muted">
          {isLoading ? <Spinner /> : 'This note is gone.'}
        </div>
      </div>
    )
  }
  return <LoadedNote note={note} onBack={onBack} />
}

function LoadedNote({ note, onBack }: { note: ResourceWithBody; onBack?: () => void }) {
  const { refetch } = useSubstrate().useResource(note.id)
  const update = useSubstrateMutations().useUpdateResource()
  const saver = useNoteSaver(note, (u) => update.mutateAsync(u))
  const [title, setTitle] = useState(note.title)
  // The editor reads its text once; a new key loads the saved note after "Reload".
  const [editorKey, setEditorKey] = useState(0)
  const [initial, setInitial] = useState(note.body_md ?? '')

  const reload = async () => {
    const fresh = await refetch()
    if (!fresh) return
    saver.reload(fresh)
    setTitle(fresh.title)
    setInitial(fresh.body_md ?? '')
    setEditorKey((k) => k + 1)
  }

  const conflict = saver.status === 'conflict'
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-1">
        {onBack && (
          <IconButton
            icon={ArrowLeft}
            label="Back to resources"
            onClick={() => {
              saver.flush()
              onBack()
            }}
          />
        )}
        <input
          aria-label="Note title"
          value={title}
          maxLength={MAX_RESOURCE_TITLE_LENGTH}
          onChange={(e) => {
            setTitle(e.target.value)
            if (e.target.value.trim()) saver.change({ title: e.target.value.trim() })
          }}
          onBlur={() => !title.trim() && setTitle(note.title)}
          className="h-9 min-w-0 flex-1 rounded-control border border-transparent bg-transparent px-2 text-title font-semibold text-text-primary hover:border-border-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line"
        />
        <span
          role="status"
          className={cn('shrink-0 text-meta', saver.status === 'failed' ? 'text-attn' : 'text-text-muted')}
        >
          {STATUS_LABEL[saver.status] ?? ''}
          {saver.status === 'failed' && (
            <button type="button" onClick={saver.retry} className="ml-1.5 font-semibold text-accent hover:underline">
              Try again
            </button>
          )}
        </span>
      </div>

      {conflict && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-attn-line bg-attn-soft px-3 py-2 text-body text-text-primary">
          <span className="min-w-0 flex-1">Changed on another device.</span>
          <button type="button" onClick={() => void reload()} className="font-semibold text-accent hover:underline">
            Reload
          </button>
          <button type="button" onClick={saver.keepMine} className="font-semibold text-accent hover:underline">
            Keep mine
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
          <NoteEditor
            key={editorKey}
            value={initial}
            label={title || 'Note'}
            readOnly={conflict}
            onChange={(markdown) => saver.change({ body_md: markdown })}
          />
        </Suspense>
      </div>
    </div>
  )
}
