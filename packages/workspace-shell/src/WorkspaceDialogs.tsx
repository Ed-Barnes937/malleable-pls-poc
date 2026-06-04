import { useEffect, useRef, useState } from 'react'
import {
  useWorkspaces,
  useCreateWorkspace,
  useDeleteWorkspace,
} from '@pls/substrate-client'
import { Dialog, TextField } from '@pls/shared-ui'
import { useWorkspaceStore } from './store'

export function CreateWorkspaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const createWorkspace = useCreateWorkspace()
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    createWorkspace.mutate(
      { name: trimmed },
      {
        onSuccess: (ws) => {
          setActiveWorkspaceId(ws.id)
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title="New Workspace">
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
            placeholder="e.g. Morning Study"
          />
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
            {createWorkspace.isPending ? 'Creating...' : 'Create'}
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
    <Dialog open={open} onClose={onClose} title="Delete Workspace">
      <p className="mb-4 text-xs text-neutral-400">
        Are you sure you want to delete{' '}
        <span className="font-medium text-neutral-200">{workspace?.name}</span>? This will remove
        all panels and settings for this workspace.
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
          {deleteWorkspace.isPending ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </Dialog>
  )
}
