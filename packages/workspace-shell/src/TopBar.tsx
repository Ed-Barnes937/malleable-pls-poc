import { Menu, LayoutGrid, Settings } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRunningJobCount } from '@pls/substrate-client'
import { useActiveWorkspaceId } from './activeBoard'
import { ThemeToggle } from './ThemeToggle'
import { JobStatusIndicator } from './JobStatusIndicator'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { BoardScope } from './BoardScope'
import { UpNext, type UpNextProps } from './UpNext'
import { BoardAppearance } from './BoardAppearance'
import { cn, useNarrowScreen } from '@pls/shared-ui'

export interface TopBarProps extends UpNextProps {
  onMenuClick: () => void
  /** Whether the board menu (drawer) is open, for the menu button's state. */
  menuOpen?: boolean
  /** Tidy up. Offered on the desktop layout only: a phone stacks the widgets anyway. */
  onOrganize?: () => void
}

const ICON_BUTTON =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary'

/**
 * The board tabs between a menu button and the Tidy up button. On a phone
 * (below 640px) the first row holds the menu button and the tabs (no Tidy
 * up: the widgets are stacked there): Activity, theme and board
 * appearance move into the board menu, and a second row has the scope
 * pills and Up next, on one line of a fixed height whatever the board shows
 * (the lecture pill and Up next shorten instead), so switching boards or
 * adding a widget never moves the board under it.
 */
export function TopBar({ onMenuClick, menuOpen = false, onOrganize, boardHasCalendar, onPlanWeek, onAddCalendar }: TopBarProps) {
  const activeWorkspaceId = useActiveWorkspaceId()
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
  const upNext = (className: string) => (
    <UpNext boardHasCalendar={boardHasCalendar} onPlanWeek={onPlanWeek} onAddCalendar={onAddCalendar} className={className} />
  )
  const scope = activeWorkspaceId && <BoardScope workspaceId={activeWorkspaceId} compact={narrow} />

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
        </div>
        {/* One line, never wrapping: its height is the same on every board. */}
        <div data-testid="top-bar-row-2" className="flex h-10 items-center gap-2">
          {scope}
          {/* The room the pills leave: as they come or go, it glides to its new width. */}
          {upNext('min-w-24 flex-1 basis-0 justify-end')}
        </div>
      </header>
    )
  }

  return (
    <header
      data-testid="top-bar"
      className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-3 py-2.5 sm:min-h-16 md:gap-2 md:px-5 lg:gap-3.5"
      style={{
        background: 'var(--color-surface-raised)',
        transition: 'var(--transition-panel)',
        zIndex: 9999,
        position: 'relative',
      }}
    >
      {menuButton}

      {/* Board tabs: they give way first (they scroll), down to their floor,
          before the lecture pill is cut short. */}
      <div data-testid="board-tabs" className="min-w-28 shrink-[100]">{tabs}</div>

      {/* What the board shows: the course and lecture pickers */}
      {scope}

      {/* What is next in the student's calendar, and a way to plan the week */}
      {upNext('min-w-9 flex-1 basis-0 justify-start')}

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
      aria-haspopup="dialog"
      aria-expanded={open}
      title={running ? `Board menu: ${count} running` : "Board menu: add widgets and automations"}
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
