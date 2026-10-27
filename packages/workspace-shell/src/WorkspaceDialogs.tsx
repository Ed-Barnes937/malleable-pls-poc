import { useEffect, useRef, useState } from 'react'
import {
  useWorkspaces,
  useCreateWorkspace,
  useDeleteWorkspace,
} from '@pls/substrate-client'
import { COURSES, Dialog, Select, TextField } from '@pls/shared-ui'
import { useWorkspaceStore } from './store'

export function CreateWorkspaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [courseTag, setCourseTag] = useState('')
  const createWorkspace = useCreateWorkspace()
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setCourseTag('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    createWorkspace.mutate(
      { name: trimmed, ...(courseTag ? { courseTag } : {}) },
      {
        onSuccess: (ws) => {
          setActiveWorkspaceId(ws.id)
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title="New board">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="ws-name" className="mb-1.5 block text-meta font-semibold text-text-secondary">
            Name
          </label>
          <TextField
            ref={inputRef}
            id="ws-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My week"
          />
        </div>
        <div>
          <label htmlFor="ws-course" className="mb-1.5 block text-meta font-semibold text-text-secondary">
            Course (optional)
          </label>
          <Select id="ws-course" value={courseTag} onChange={(e) => setCourseTag(e.target.value)}>
            <option value="">All courses</option>
            {COURSES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-meta text-text-muted">Widgets on this board focus on this course. You can change it later.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-control px-3.5 text-body font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || createWorkspace.isPending}
            className="h-9 rounded-control bg-accent px-3.5 text-body font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-40"
          >
            {createWorkspace.isPending ? 'Creating...' : 'Create board'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function DeleteWorkspaceDialog({
  open,
  onClose,
  workspace,
}: {
  open: boolean
  onClose: () => void
  workspace: { id: string; name: string } | null
}) {
  const deleteWorkspace = useDeleteWorkspace()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)
  const { data: workspaces } = useWorkspaces()

  const handleDelete = () => {
    if (!workspace) return
    deleteWorkspace.mutate(workspace.id, {
      onSuccess: () => {
        if (activeWorkspaceId === workspace.id && workspaces) {
          const remaining = workspaces.filter((ws) => ws.id !== workspace.id)
          if (remaining.length > 0) setActiveWorkspaceId(remaining[0].id)
        }
        onClose()
      },
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title="Delete board">
      <p className="mb-4 text-body text-text-secondary">
        Delete <span className="font-semibold text-text-primary">{workspace?.name}</span>? Its widgets
        and settings are removed. Your lectures, notes and to-dos stay.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-control px-3.5 text-body font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteWorkspace.isPending}
          className="h-9 rounded-control bg-confused px-3.5 text-body font-medium text-surface-raised transition-colors hover:bg-confused/90 disabled:opacity-40"
        >
          {deleteWorkspace.isPending ? 'Deleting...' : 'Delete board'}
        </button>
      </div>
    </Dialog>
  )
}
