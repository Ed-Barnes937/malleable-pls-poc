import { Menu, LayoutGrid, Settings, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspaceScopes, useFocusedRecording, decodeScope } from '@pls/substrate-client'
import { useWorkspaceStore } from './store'
import { ThemeToggle } from './ThemeToggle'
import { JobStatusIndicator } from './JobStatusIndicator'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { useBoardScopeDims } from './useBoardScopeDims'
import { TodayLine } from './TodayLine'
import { BackgroundPicker } from '@pls/panel-system'
import { COURSES } from '@pls/shared-ui'

export interface TopBarProps {
  onMenuClick: () => void
  /** Whether the board menu (drawer) is open, for the menu button's state. */
  menuOpen?: boolean
  onOrganize?: () => void
}

const ICON_BUTTON =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary'

/**
 * Summarises the board scope as "Showing: ..." chip text, limited to the
 * dimensions some widget on the board actually uses, so the chip never
 * claims a filter nothing applies. A board whose widgets use the course but
 * has none set (and no focused lecture) says "All courses" rather than hiding the chip, so the
 * student can always see (and change) what the board shows. Returns null
 * when no widget uses any scope.
 */
export function useScopeSummary(workspaceId: string): string | null {
  const dims = useBoardScopeDims(workspaceId)
  const { data: scopes } = useWorkspaceScopes(workspaceId)
  const s = useMemo(
    () => decodeScope((scopes ?? []) as { scope_type: string; scope_value: string }[]),
    [scopes],
  )
  const { data: focused } = useFocusedRecording(s.recordingId)

  return useMemo(() => {
    const lecture = s.recordingId && dims.has('recordingId') && focused?.id === s.recordingId
      ? (focused?.title as string | undefined)
      : undefined
    const parts: string[] = []
    if (dims.has('courseTag')) {
      if (s.courseTag) parts.push(COURSES.find((c) => c.value === s.courseTag)?.label ?? s.courseTag)
      // "All courses" next to one lecture reads as a contradiction; the lecture says enough.
      else if (!lecture) parts.push('All courses')
    }
    if (lecture) parts.push(lecture)
    return parts.length > 0 ? parts.join(' · ') : null
  }, [s, dims, focused])
}

export function TopBar({ onMenuClick, menuOpen = false, onOrganize }: TopBarProps) {
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
      // Wraps on narrow screens: the "Showing" chip drops to its own row
      // and the board tabs scroll sideways instead of pushing things off-screen.
      className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-border-subtle px-3 py-2.5 sm:min-h-16 sm:flex-nowrap sm:px-5"
      style={{
        background: 'var(--color-surface-raised)',
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
        aria-label="Board menu"
        aria-expanded={menuOpen}
        title="Board menu: add widgets, choose what's shown"
        className={ICON_BUTTON}
      >
        <Menu size={20} />
      </button>

      {/* Board tabs */}
      <div className="min-w-0 flex-1 sm:flex-initial">
        <WorkspaceSwitcher />
      </div>

      {/* Scope chip - opens the board menu, where the scope is changed */}
      {scopeSummary && (
        <button
          type="button"
          data-testid="scope-chip"
          onClick={onMenuClick}
          title={`Showing: ${scopeSummary}. Click to change.`}
          className="order-last min-w-0 max-w-full truncate rounded-full bg-surface-overlay px-3 py-1.5 text-left text-body font-semibold text-text-primary transition-colors hover:bg-border-subtle sm:order-none sm:max-w-[40ch]"
        >
          <span className="font-normal text-text-secondary">Showing: </span>
          {scopeSummary}
        </button>
      )}

      {/* Today at a glance (wide screens only) */}
      <TodayLine workspaceId={activeWorkspaceId} />

      {/* Spacer */}
      <div className="hidden flex-1 sm:block" />

      <div className="flex shrink-0 items-center gap-1">
        {/* Background activity */}
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
            aria-label="Board appearance"
            aria-expanded={settingsOpen}
            title="Board appearance"
            className={ICON_BUTTON}
          >
            <Settings size={18} />
          </button>
          {settingsOpen && (
            <div
              ref={settingsRef}
              data-testid="settings-popover"
              className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-16px)] rounded-widget border border-border-subtle p-4"
              style={{
                background: 'var(--color-surface-raised)',
                boxShadow: 'var(--shadow-pop)',
                zIndex: 10002,
              }}
            >
              <BackgroundPicker />
              <div className="mt-3 border-t border-border-subtle pt-3">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="flex items-center gap-1.5 rounded-item px-2 py-1 text-meta text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
                  title="Reload the page"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reload
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
            aria-label="Tidy up widgets"
            title="Tidy up widgets"
            className={ICON_BUTTON}
          >
            <LayoutGrid size={18} />
          </button>
        )}
      </div>
    </header>
  )
}
