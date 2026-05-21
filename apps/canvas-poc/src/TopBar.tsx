import { Menu, Plus } from 'lucide-react'
import type { ReactNode } from 'react'

export interface TopBarProps {
  onMenuClick: () => void
  onAddPanel: () => void
  trailing?: ReactNode
}

export function TopBar({ onMenuClick, onAddPanel, trailing }: TopBarProps) {
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
        My Workspace
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
        All items
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Trailing slot (e.g. theme toggle) */}
      {trailing}

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
