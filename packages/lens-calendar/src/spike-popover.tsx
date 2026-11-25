/**
 * THROWAWAY SPIKE (K0 spike 1). Never merged.
 *
 * Swaps the calendar popovers' outer element onto UI SDK Popover so we can see
 * whether its outside-press handling covers what closing-press.ts does today.
 *
 * Mode (localStorage `spike-popover` wins over VITE_SPIKE_POPOVER):
 * - native       today's code, untouched
 * - sdk          UI SDK owns dismissal (outside press, Escape, focus-out, focus return); no press marks
 * - sdk-marks    as sdk, but onOpenChange's outside-press event is marked with closing-press.ts
 *                (CalendarLens's capture-phase handler is off)
 * - sdk-capture  UI SDK Popover renders and positions; CalendarLens's capture handler +
 *                closing-press.ts stay as today; SDK's outside-press is cancelled
 */
import { useMemo, type ReactNode } from 'react'
import { Popover, PopoverContent } from '@ui-sdk/react/popover'
import { placePopover, type Span } from './popover-position'

export type SpikeMode = 'native' | 'sdk' | 'sdk-marks' | 'sdk-capture'

function readMode(): SpikeMode {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('spike-popover') : null
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SPIKE_POPOVER
  return (stored ?? env ?? 'native') as SpikeMode
}

export const spikeMode: SpikeMode = readMode()
export const sdk = spikeMode !== 'native'
/** localStorage `spike-final-focus` = 'off' turns finalFocus off, to see UI SDK's default. */
const spikeFinalFocus = typeof localStorage === 'undefined' || localStorage.getItem('spike-final-focus') !== 'off'

/** Set by CalendarLens on every render: the calendar root and what an SDK dismissal does. */
export const spikeHost: {
  root: HTMLElement | null
  open: boolean
  /** What had focus when the popover opened (CalendarLens's openerRef). */
  opener: HTMLElement | null
  onClosed: () => void
  onDismiss: (reason: string, event: Event | undefined, cancel: () => void) => void
} = { root: null, open: true, opener: null, onClosed: () => {}, onDismiss: () => {} }

if (typeof window !== 'undefined') (window as unknown as { __spikePopover: SpikeMode }).__spikePopover = spikeMode

/**
 * Wraps a popover's body in UI SDK Popover, anchored to the press: beside the
 * press point on a wide calendar, above/below the pressed block when beside
 * would cover it (phone, narrow panel), like placePopover.
 */
export function SpikePopoverShell({ x, y, span, bounds, width, label, children }: {
  x: number
  y: number
  span?: Span
  bounds: { width: number; height: number }
  width: number
  label: string
  children: ReactNode
}) {
  // Same test placePopover uses: would sitting beside the point cover it?
  const beside = placePopover({ x, y, span, bounds, width, height: 1 })
  const vertical = beside.left <= x && x <= beside.left + width
  const top = span?.top ?? y
  const bottom = span?.bottom ?? y
  const anchor = useMemo(() => ({
    getBoundingClientRect: () => {
      const r = spikeHost.root?.getBoundingClientRect() ?? { left: 0, top: 0 }
      return vertical
        ? DOMRect.fromRect({ x: r.left + x, y: r.top + top, width: 0, height: bottom - top })
        : DOMRect.fromRect({ x: r.left + x, y: r.top + y, width: 0, height: 0 })
    },
  }), [vertical, x, y, top, bottom])

  return (
    <Popover
      open={sdk && spikeMode !== 'sdk-capture' ? spikeHost.open : true}
      onOpenChangeComplete={(open) => { if (!open) spikeHost.onClosed() }}
      onOpenChange={(open, details) => {
        const d = details as unknown as { reason: string; event?: Event; cancel: () => void }
        ;(window as unknown as { __spikeLog?: string[] }).__spikeLog?.push(`${open ? 'open' : 'close'}:${d.reason}:${d.event?.type ?? '-'}`)
        if (!open) spikeHost.onDismiss(d.reason, d.event, d.cancel)
      }}
    >
      <PopoverContent
        anchor={anchor}
        side={vertical ? 'top' : 'right'}
        align={vertical ? 'center' : 'start'}
        sideOffset={12}
        alignOffset={vertical ? 0 : -24}
        collisionPadding={8}
        aria-label={label}
        // Today's popovers focus their own first field (autoFocus); leave that to them.
        initialFocus="none"
        // Rendered open (no trigger, no controller): UI SDK has nothing to return focus to, so name it.
        finalFocus={spikeFinalFocus ? () => spikeHost.opener : undefined}
        data-calendar-popover
        className="m-0 overflow-visible border-0 bg-transparent p-0 text-inherit"
        style={{ width }}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}
