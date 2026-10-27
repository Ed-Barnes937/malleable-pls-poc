import { useState } from 'react'
import { LayoutGrid, Plus } from 'lucide-react'
import type { PanelManifest } from '@pls/lens-framework'
import { cn } from '@pls/shared-ui'
import { BOARD_STARTERS, listNames, starterWidgets, type BoardStarter } from './starters'

/** Icon tile colours per starter (token pairs checked in theme-contrast.test.ts). */
const TONE: Record<BoardStarter['id'], string> = {
  plan: 'bg-accent-soft text-accent',
  capture: 'bg-confused-soft text-confused',
  revise: 'bg-good-soft text-good',
}

export interface BoardStartersProps {
  manifests: ReadonlyArray<PanelManifest>
  /** Adds the starter's widgets to the board; `onFailed` runs if one of them couldn't be added. */
  onStart: (widgets: PanelManifest[], onFailed: () => void) => void
  /** Opens the widget palette. */
  onAddWidgets: () => void
}

/**
 * First run on an empty board: one sentence, three starting points by
 * intent (each adds a few widgets, nothing else), and "Add widgets" to pick
 * your own.
 */
export function BoardStarters({ manifests, onStart, onAddWidgets }: BoardStartersProps) {
  // One starter per board: the board stops being empty once its widgets save.
  const [started, setStarted] = useState(false)
  const starters = BOARD_STARTERS
    .map((starter) => ({ starter, widgets: starterWidgets(starter, manifests) }))
    .filter((s) => s.widgets.length > 0)

  return (
    <div className="pointer-events-auto flex w-full max-w-3xl flex-col items-center gap-5 px-4 text-center">
      <div className="flex flex-col items-center gap-3">
        <h2 className="text-heading font-semibold text-text-primary">This board is yours to build.</h2>
        <p className="max-w-[52ch] text-title text-text-secondary">
          Pick a starting point and we&apos;ll add a few widgets. You can move, swap or remove any of them.
        </p>
      </div>
      <ul className="grid w-full grid-cols-1 gap-3.5 sm:grid-cols-3" aria-label="Starting points">
        {starters.map(({ starter, widgets }) => {
          const names = listNames(widgets.map((w) => w.label))
          return (
            <li key={starter.id} className="flex">
              <button
                type="button"
                data-testid={`board-starter-${starter.id}`}
                disabled={started}
                onClick={() => {
                  setStarted(true)
                  onStart(widgets, () => setStarted(false))
                }}
                aria-label={`${starter.label}: add ${names}`}
                className={cn(
                  'group flex w-full flex-col gap-3 rounded-widget border border-border-subtle bg-surface-raised p-4 text-left shadow-panel transition-[border-color,box-shadow] disabled:cursor-default',
                  'enabled:hover:border-accent-line enabled:hover:ring-4 enabled:hover:ring-accent-soft',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                )}
              >
                <span className="flex gap-1.5" aria-hidden>
                  {widgets.map(({ id, icon: Icon }) => (
                    <span key={id} className={cn('grid h-9 w-9 place-items-center rounded-item', TONE[starter.id])}>
                      <Icon className="size-4.5" />
                    </span>
                  ))}
                </span>
                <span className="flex items-center gap-1.5 text-title font-semibold text-text-primary">
                  {starter.label}
                  <Plus size={16} aria-hidden className="ml-auto text-text-muted group-hover:text-accent" />
                </span>
                <span className="text-meta text-text-muted">{names}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center gap-3 text-body text-text-muted">
        or
        <button
          type="button"
          onClick={onAddWidgets}
          className="inline-flex items-center gap-2 rounded-control border border-border bg-surface-raised px-3.5 py-2 text-body font-medium text-text-primary transition-colors hover:bg-surface-overlay"
        >
          <LayoutGrid size={16} aria-hidden />
          Add widgets
        </button>
      </div>
    </div>
  )
}
