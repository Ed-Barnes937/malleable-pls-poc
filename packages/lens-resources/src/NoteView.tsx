import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { cn, IconButton, Spinner } from '@pls/shared-ui'
import { MAX_RESOURCE_TITLE_LENGTH, type ResourceUpdate } from '@pls/substrate'
import { ArrowLeft } from 'lucide-react'
import { openNoteSaver, type NoteSaver, type SaveStatus } from './noteSavers'

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
  /** Set while the host asks whether to leave with changes that aren't saved. */
  leaving?: { onStay: () => void; onLeave: () => void }
}

export function NoteView({ noteId, onBack, leaving }: NoteViewProps) {
  const { data: note, isLoading } = useSubstrate().useResource(noteId)
  const update = useSubstrateMutations().useUpdateResource()
  const save = (u: ResourceUpdate) => update.mutateAsync(u)
  // A note still saving (or not saved) from last time opens with the student's
  // text, without waiting for (or trusting) the server's copy.
  const [saver, setSaver] = useState<NoteSaver | null>(() => openNoteSaver(noteId, note, save))
  useEffect(() => {
    if (!saver && note) setSaver(openNoteSaver(noteId, note, save))
  })
  saver?.setSave(save)

  if (!saver) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        {onBack && <IconButton icon={ArrowLeft} label="Back to resources" onClick={onBack} />}
        <div className="flex flex-1 items-center justify-center text-body text-text-muted">
          {isLoading ? <Spinner /> : 'This note is gone.'}
        </div>
      </div>
    )
  }
  return <LoadedNote saver={saver} onBack={onBack} leaving={leaving} />
}

function LoadedNote({ saver, onBack, leaving }: { saver: NoteSaver; onBack?: () => void; leaving?: NoteViewProps['leaving'] }) {
  const { refetch } = useSubstrate().useResource(saver.id)
  const status = useSyncExternalStore(saver.subscribe, () => saver.status)
  const [title, setTitle] = useState(saver.title)
  // The editor reads its text once; a new key loads the saved note after "Reload".
  const [editorKey, setEditorKey] = useState(0)
  const [initial, setInitial] = useState(saver.body)

  // While the note shows, changes wait for a pause; once it closes, they
  // (the editor's last words) save at once. Leaving saves what's left.
  useEffect(() => {
    saver.attach()
    return () => saver.detach()
  }, [saver])

  const reload = async () => {
    const fresh = await refetch()
    if (!fresh) return
    saver.reload(fresh)
    setTitle(fresh.title)
    setInitial(fresh.body_md ?? '')
    setEditorKey((k) => k + 1)
  }

  const conflict = status === 'conflict'
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-1">
        {onBack && <IconButton icon={ArrowLeft} label="Back to resources" onClick={onBack} />}
        <input
          aria-label="Note title"
          value={title}
          maxLength={MAX_RESOURCE_TITLE_LENGTH}
          onChange={(e) => {
            setTitle(e.target.value)
            if (e.target.value.trim()) saver.change({ title: e.target.value.trim() })
          }}
          onBlur={() => !title.trim() && setTitle(saver.title)}
          className="h-9 min-w-0 flex-1 rounded-control border border-transparent bg-transparent px-2 text-title font-semibold text-text-primary hover:border-border-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line"
        />
        <span role="status" className={cn('shrink-0 text-meta', status === 'failed' ? 'text-attn' : 'text-text-muted')}>
          {STATUS_LABEL[status] ?? ''}
          {status === 'failed' && (
            <button type="button" onClick={saver.flush} className="ml-1.5 font-semibold text-accent hover:underline">
              Try again
            </button>
          )}
        </span>
      </div>

      {leaving && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-attn-line bg-attn-soft px-3 py-2 text-body text-text-primary">
          <span className="min-w-0 flex-1">
            Your latest changes aren't saved. If you leave, they stay here as "Not saved" until you close or reload the page.
          </span>
          <button type="button" onClick={leaving.onStay} className="font-semibold text-accent hover:underline">
            Stay
          </button>
          <button type="button" onClick={leaving.onLeave} className="font-semibold text-accent hover:underline">
            Leave
          </button>
        </div>
      )}

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
