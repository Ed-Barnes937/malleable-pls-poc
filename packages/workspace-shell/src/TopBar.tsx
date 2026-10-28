import { Menu, LayoutGrid, Settings } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspaceScopes, useFocusedRecording, useRunningJobCount, decodeScope } from '@pls/substrate-client'
import { useWorkspaceStore } from './store'
import { ThemeToggle } from './ThemeToggle'
import { JobStatusIndicator } from './JobStatusIndicator'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { useBoardScopeDims } from './useBoardScopeDims'
import { TodayLine } from './TodayLine'
import { BoardAppearance } from './BoardAppearance'
import { COURSES, cn, useNarrowScreen } from '@pls/shared-ui'

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

/**
 * The board tabs between a menu button and the widgets button. On a phone
 * (below 640px) that is all the first row holds: Activity, theme and board
 * appearance move into the board menu, and a second row has the "Showing"
 * chip and the short today line.
 */
export function TopBar({ onMenuClick, menuOpen = false, onOrganize }: TopBarProps) {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const scopeSummary = useScopeSummary(activeWorkspaceId)
  const narrow = useNarrowScreen()

  const menuButton = <MenuButton onClick={onMenuClick} open={menuOpen} showRunning={narrow} />
  const tabs = <WorkspaceSwitcher />
  const organizeButton = onOrganize && (
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
  )
  const scopeChip = (className: string) => scopeSummary && (
    <button
      type="button"
      data-testid="scope-chip"
      onClick={onMenuClick}
      title={`Showing: ${scopeSummary}. Click to change.`}
      className={cn(
        'min-w-0 truncate rounded-full bg-surface-overlay text-left font-semibold text-text-primary transition-colors hover:bg-border-subtle',
        className,
      )}
    >
      <span className="font-normal text-text-secondary">Showing: </span>
      {scopeSummary}
    </button>
  )

  if (narrow) {
    return (
      <header
        data-testid="top-bar"
        data-layout="phone"
        className="relative z-[9999] flex shrink-0 flex-col gap-2 border-b border-border-subtle bg-surface-raised px-3 pt-2 pb-2.5"
      >
        <div className="flex items-center gap-1.5">
          {menuButton}
          <div className="min-w-0 flex-1">{tabs}</div>
          {organizeButton}
        </div>
        {/* Nothing in it (no scope, nothing today) and it takes no room. */}
        <div className="flex items-center gap-2 empty:hidden">
          {scopeChip('max-w-full shrink px-3 py-1 text-meta')}
          <TodayLine workspaceId={activeWorkspaceId} short />
        </div>
      </header>
    )
  }

  return (
    <header
      data-testid="top-bar"
      className="flex shrink-0 items-center gap-3.5 border-b border-border-subtle px-5 py-2.5 sm:min-h-16"
      style={{
        background: 'var(--color-surface-raised)',
        transition: 'var(--transition-panel)',
        zIndex: 9999,
        position: 'relative',
      }}
    >
      {menuButton}

      {/* Board tabs */}
      <div className="min-w-0">{tabs}</div>

      {/* Scope chip - opens the board menu, where the scope is changed */}
      {scopeChip('max-w-[40ch] px-3 py-1.5 text-body')}

      {/* Today at a glance (wide screens only) */}
      <TodayLine workspaceId={activeWorkspaceId} />

      {/* Spacer */}
      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-1">
        {/* Background activity */}
        <JobStatusIndicator />

        {/* Theme toggle */}
        <ThemeToggle />

        <SettingsPopover />

        {organizeButton}
      </div>
    </header>
  )
}

/**
 * Opens the board menu. On a phone, where Activity lives in that menu, a dot
 * says something is running.
 */
function MenuButton({ onClick, open, showRunning }: { onClick: () => void; open: boolean; showRunning: boolean }) {
  const { data: count } = useRunningJobCount()
  const running = showRunning && (count ?? 0) > 0
  return (
    <button
      data-testid="drawer-trigger"
      type="button"
      onClick={onClick}
      aria-label={running ? `Board menu, ${count} running` : 'Board menu'}
      aria-expanded={open}
      title={running ? `Board menu: ${count} running` : "Board menu: add widgets, choose what's shown"}
      className={cn(ICON_BUTTON, 'relative')}
    >
      <Menu size={20} />
      {running && (
        <span
          data-testid="menu-running-dot"
          aria-hidden
          className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-surface-raised motion-safe:animate-pulse"
        />
      )}
    </button>
  )
}

function SettingsPopover() {
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const toggle = useCallback(() => {
    setOpen((v) => !v)
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current?.contains(e.target as Node) ||
        buttonRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        data-testid="settings-button"
        type="button"
        onClick={toggle}
        aria-label="Board appearance"
        aria-expanded={open}
        title="Board appearance"
        className={ICON_BUTTON}
      >
        <Settings size={18} />
      </button>
      {open && (
        <div
          ref={popoverRef}
          data-testid="settings-popover"
          className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-16px)] rounded-widget border border-border-subtle p-4"
          style={{
            background: 'var(--color-surface-raised)',
            boxShadow: 'var(--shadow-pop)',
            zIndex: 10002,
          }}
        >
          <BoardAppearance />
        </div>
      )}
    </div>
  )
}
