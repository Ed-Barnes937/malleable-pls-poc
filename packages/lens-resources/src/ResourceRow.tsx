import { useState, type ComponentType, type FormEvent } from 'react'
import { cn, courseTone, IconButton } from '@pls/shared-ui'
import { MAX_RESOURCE_TITLE_LENGTH, parseResourceUrl, resourceCourse, type Resource } from '@pls/substrate'
import {
  ClipboardList,
  FileText,
  Folder,
  Link as LinkIcon,
  MoreHorizontal,
  NotebookPen,
  Presentation,
  Sheet,
  Undo2,
} from 'lucide-react'
import { editedAgo } from './grouping'

/** Icon and its tint (tokens) for a resource's kind. */
function iconFor(resource: Resource): { icon: ComponentType<{ className?: string }>; tint: string } {
  if (resource.kind === 'note') return { icon: NotebookPen, tint: 'bg-surface-inset text-text-secondary' }
  switch (resource.provider) {
    case 'google_doc':
      return { icon: FileText, tint: 'bg-accent-soft text-accent' }
    case 'google_sheet':
      return { icon: Sheet, tint: 'bg-good-soft text-good' }
    case 'google_slides':
      return { icon: Presentation, tint: 'bg-attn-soft text-attn' }
    case 'google_form':
      return { icon: ClipboardList, tint: 'bg-accent-soft text-accent' }
    case 'google_drive':
      return { icon: Folder, tint: 'bg-surface-inset text-text-secondary' }
    default:
      return { icon: LinkIcon, tint: 'bg-surface-inset text-text-secondary' }
  }
}

/** What a row says under its title: "Google Sheet", "khanacademy.org", "Note · edited 2h ago". */
export function resourceMeta(resource: Resource, now: number): string {
  if (resource.kind === 'note') return `Note · edited ${editedAgo(resource.updated_at, now)}`
  return (resource.url && parseResourceUrl(resource.url)?.label) || 'Link'
}

export interface ResourceRowProps {
  resource: Resource
  now: number
  /** Show the course (on an "All courses" board). */
  showCourse: boolean
  onOpenNote: (id: string) => void
  onRename: (title: string) => void
  onMove: () => void
  onDelete: () => void
  /** Set while a delete can still be undone. */
  deleted?: { onUndo: () => void }
}

export function ResourceRow({ resource, now, showCourse, onOpenNote, onRename, onMove, onDelete, deleted }: ResourceRowProps) {
  const [actions, setActions] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const { icon: Icon, tint } = iconFor(resource)
  const course = resourceCourse(resource)

  if (deleted) {
    return (
      <li className="flex items-center gap-3 py-2 text-meta text-text-muted">
        <span className="min-w-0 flex-1 truncate">Deleted {resource.title}</span>
        <button
          type="button"
          onClick={deleted.onUndo}
          aria-label={`Undo delete: ${resource.title}`}
          className="inline-flex h-7 items-center gap-1 rounded-item px-2 font-semibold text-accent hover:bg-accent-soft"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
          Undo
        </button>
      </li>
    )
  }

  const submitRename = (e: FormEvent) => {
    e.preventDefault()
    const title = (renaming ?? '').trim()
    if (title && title !== resource.title) onRename(title)
    setRenaming(null)
  }

  return (
    <li className="flex flex-col py-1.5" data-testid="resource-row">
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-item', tint)} aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {renaming !== null ? (
            <form onSubmit={submitRename}>
              <input
                autoFocus
                aria-label={`New name for ${resource.title}`}
                value={renaming}
                maxLength={MAX_RESOURCE_TITLE_LENGTH}
                onChange={(e) => setRenaming(e.target.value)}
                onBlur={submitRename}
                onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
                className="h-8 w-full rounded-control border border-border bg-surface-raised px-2 text-body text-text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line"
              />
            </form>
          ) : resource.kind === 'link' && resource.url ? (
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-body font-semibold text-text-primary hover:text-accent hover:underline"
            >
              {resource.title}
            </a>
          ) : (
            <button
              type="button"
              onClick={() => onOpenNote(resource.id)}
              className="truncate text-left text-body font-semibold text-text-primary hover:text-accent hover:underline"
            >
              {resource.title}
            </button>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-muted">
            <span>{resourceMeta(resource, now)}</span>
            {showCourse && course && (
              <span className={cn('inline-flex h-[22px] items-center rounded-full px-2 font-semibold capitalize', courseTone(course).tint, courseTone(course).ink)}>
                {course}
              </span>
            )}
          </div>
          {resource.kind === 'note' && resource.excerpt && (
            <p className="line-clamp-2 text-meta text-text-secondary">{resource.excerpt}</p>
          )}
        </div>
        <IconButton
          icon={MoreHorizontal}
          label={`More for ${resource.title}`}
          aria-expanded={actions}
          onClick={() => setActions((open) => !open)}
          className={cn('shrink-0', actions && 'bg-surface-overlay text-text-primary')}
        />
      </div>
      {actions && (
        <div className="ml-11 mt-1 flex flex-wrap gap-1" role="group" aria-label={`Actions for ${resource.title}`}>
          {[
            { label: 'Rename', run: () => setRenaming(resource.title) },
            { label: 'Move', run: onMove },
            { label: 'Delete', run: onDelete },
          ].map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                setActions(false)
                action.run()
              }}
              className="inline-flex h-8 items-center rounded-item border border-border-subtle px-2.5 text-meta font-semibold text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}
