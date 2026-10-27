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
          <label htmlFor="ws-name" className="mb-1 block text-xs text-neutral-400">
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
          <label htmlFor="ws-course" className="mb-1 block text-xs text-neutral-400">
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
          <p className="mt-1 text-[11px] text-neutral-500">Widgets on this board focus on this course. You can change it later.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-surface-overlay hover:text-neutral-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || createWorkspace.isPending}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
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
      <p className="mb-4 text-xs text-neutral-400">
        Delete <span className="font-medium text-neutral-200">{workspace?.name}</span>? Its widgets
        and settings are removed. Your lectures, notes and to-dos stay.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-surface-overlay hover:text-neutral-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteWorkspace.isPending}
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-40"
        >
          {deleteWorkspace.isPending ? 'Deleting...' : 'Delete board'}
        </button>
      </div>
    </Dialog>
  )
}
