import { Menu, Plus, LayoutGrid } from 'lucide-react'
import { useMemo } from 'react'
import {
  useWorkspaces,
  useWorkspaceScopes,
} from '@pls/substrate-client'
import { useWorkspaceStore } from './store'
import { ThemeToggle } from './ThemeToggle'
import { JobStatusIndicator } from './JobStatusIndicator'

export interface TopBarProps {
  onMenuClick: () => void
  onAddPanel: () => void
  onOrganize?: () => void
}

/**
 * Summarise the active scope filters into a compact chip label.
 * Returns "All items" when nothing is filtered.
 */
function useScopeSummary(workspaceId: string): string {
  const { data: scopes } = useWorkspaceScopes(workspaceId)

  return useMemo(() => {
    if (!scopes || scopes.length === 0) return 'All items'
    const parts: string[] = []
    for (const s of scopes as { scope_type: string; scope_value: string }[]) {
      if (!s.scope_value) continue
      if (s.scope_type === 'tag') parts.push(s.scope_value)
      if (s.scope_type === 'recording') parts.push('1 recording')
      if (s.scope_type === 'timeframe') {
        if (s.scope_value === 'week') parts.push('This week')
        else if (s.scope_value === 'all') parts.push('All time')
      }
    }
    return parts.length > 0 ? parts.join(' · ') : 'All items'
  }, [scopes])
}

export function TopBar({ onMenuClick, onAddPanel, onOrganize }: TopBarProps) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { data: workspaces } = useWorkspaces()
  const scopeSummary = useScopeSummary(activeWorkspaceId)

  const workspaceName = useMemo(() => {
    if (!workspaces) return '…'
    const ws = workspaces.find((w) => w.id === activeWorkspaceId)
    return ws?.name ?? 'Workspace'
  }, [workspaces, activeWorkspaceId])

  return (
    <header
      data-testid="top-bar"
      className="flex shrink-0 items-center gap-3 px-4 py-2.5"
      style={{
        background: 'var(--color-surface-raised)',
        boxShadow: 'var(--shadow-panel)',
        transition: 'var(--transition-panel)',
        zIndex: 9999,
        position: 'relative',
      }}
    >
      {/* Hamburger / drawer trigger */}
      <button
        data-testid="drawer-trigger"
        type="button"
        onClick={onMenuClick}
        aria-label="Toggle drawer"
        className="flex items-center justify-center rounded-[var(--radius-panel)] p-2 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
      >
        <Menu size={18} />
      </button>

      {/* Workspace name */}
      <span
        data-testid="workspace-name"
        className="text-sm font-semibold text-text-primary"
      >
        {workspaceName}
      </span>

      {/* Scope chip */}
      <span
        data-testid="scope-chip"
        className="rounded-full px-2.5 py-0.5 text-xs text-text-secondary"
        style={{
          background: 'var(--color-surface-overlay)',
          transition: 'var(--transition-panel)',
        }}
      >
        {scopeSummary}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Job activity */}
      <JobStatusIndicator />

      {/* Theme toggle */}
      <ThemeToggle />

      {/* Organize button */}
      {onOrganize && (
        <button
          data-testid="organize-button"
          type="button"
          onClick={onOrganize}
          aria-label="Auto-organize panels"
          className="flex items-center justify-center rounded-[var(--radius-panel)] p-2 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          <LayoutGrid size={16} />
        </button>
      )}

      {/* Add panel button */}
      <button
        data-testid="add-panel-button"
        type="button"
        onClick={onAddPanel}
        aria-label="Add panel"
        className="flex items-center gap-1.5 rounded-[var(--radius-panel)] px-3 py-1.5 text-sm font-medium text-accent-foreground"
        style={{
          background: 'var(--color-accent)',
          transition: 'var(--transition-panel)',
        }}
      >
        <Plus size={16} />
        Add
      </button>
    </header>
  )
}
