import { useWorkspaces } from '@pls/substrate'
import { cn } from '@pls/shared-ui'
import { useWorkspaceStore } from './store'
import { BookOpen, Moon, GraduationCap } from 'lucide-react'

const WORKSPACE_ICONS: Record<string, typeof BookOpen> = {
  'ws-in-lecture': BookOpen,
  'ws-evening-review': Moon,
  'ws-exam-prep': GraduationCap,
}

export function WorkspaceSwitcher() {
  const { data: workspaces } = useWorkspaces()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)

  if (!workspaces) return null

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-surface p-1">
      {workspaces.map((ws) => {
        const Icon = WORKSPACE_ICONS[ws.id] ?? BookOpen
        const isActive = activeWorkspaceId === ws.id
        return (
          <button
            key={ws.id}
            onClick={() => setActiveWorkspaceId(ws.id)}
            className={cn(
              'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150',
              isActive
                ? 'bg-surface-raised text-neutral-100 shadow-sm shadow-black/20'
                : 'text-neutral-500 hover:bg-surface-overlay/30 hover:text-neutral-300'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {ws.name}
          </button>
        )
      })}
    </div>
  )
}
