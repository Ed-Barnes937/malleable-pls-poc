import { Menu, LayoutGrid, Settings, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspaceScopes } from '@pls/substrate-client'
import { useWorkspaceStore } from './store'
import { ThemeToggle } from './ThemeToggle'
import { JobStatusIndicator } from './JobStatusIndicator'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { BackgroundPicker } from '@pls/panel-system'

export interface TopBarProps {
  onMenuClick: () => void
  onOrganize?: () => void
}

function useScopeSummary(workspaceId: string): string | null {
  const { data: scopes } = useWorkspaceScopes(workspaceId)

  return useMemo(() => {
    if (!scopes || scopes.length === 0) return null
    const parts: string[] = []
    for (const s of scopes as { scope_type: string; scope_value: string }[]) {
      if (!s.scope_value) continue
      if (s.scope_type === 'tag') parts.push(s.scope_value)
      if (s.scope_type === 'timeframe') {
        if (s.scope_value === 'week') parts.push('This week')
        else if (s.scope_value === 'all') parts.push('All time')
      }
    }
    return parts.length > 0 ? parts.join(' · ') : null
  }, [scopes])
}

export function TopBar({ onMenuClick, onOrganize }: TopBarProps) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const scopeSummary = useScopeSummary(activeWorkspaceId)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const settingsBtnRef = useRef<HTMLButtonElement>(null)

  const toggleSettings = useCallback(() => {
    setSettingsOpen((v) => !v)
  }, [])

  useEffect(() => {
    if (!settingsOpen) return
    const handler = (e: MouseEvent) => {
      if (
        settingsRef.current?.contains(e.target as Node) ||
        settingsBtnRef.current?.contains(e.target as Node)
      ) return
      setSettingsOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [settingsOpen])

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

      {/* Workspace tabs */}
      <WorkspaceSwitcher />

      {/* Scope chip — hidden when no filters are active */}
      {scopeSummary && (
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
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Job activity */}
      <JobStatusIndicator />

      {/* Theme toggle */}
      <ThemeToggle />

      {/* Settings popover */}
      <div className="relative">
        <button
          ref={settingsBtnRef}
          data-testid="settings-button"
          type="button"
          onClick={toggleSettings}
          aria-label="Settings"
          className="flex items-center justify-center rounded-[var(--radius-panel)] p-2 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          <Settings size={16} />
        </button>
        {settingsOpen && (
          <div
            ref={settingsRef}
            data-testid="settings-popover"
            className="absolute right-0 top-full mt-2 w-64 rounded-[var(--radius-panel)] border border-border-subtle p-4"
            style={{
              background: 'var(--color-surface-raised)',
              boxShadow: 'var(--shadow-panel-focused)',
              zIndex: 10002,
            }}
          >
            <BackgroundPicker />
            <div className="mt-3 border-t border-border-subtle pt-3">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-neutral-600 transition-colors hover:bg-surface-overlay hover:text-neutral-400"
                title="Reset demo data"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

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
    </header>
  )
}
