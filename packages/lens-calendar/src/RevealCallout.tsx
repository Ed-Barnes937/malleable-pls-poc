import { useLayoutEffect, useRef } from 'react'
import { position } from '@ui-sdk/core'
import type { PlanItemOccurrence } from '@pls/substrate'
import { useSubstrate } from '@pls/lens-framework'
import { cn, courseTone } from '@pls/shared-ui'
import { AudioLines } from 'lucide-react'
import { formatSpan, formatWeekday } from './time'
import { MomentSourceText, momentSourceLabel } from './StudyBlockPopover'

interface RevealCalloutProps {
  item: PlanItemOccurrence
  /** Just under the block, in grid pixels. */
  top: number
  /** On the last columns, grow leftwards so it stays inside the grid. */
  alignRight: boolean
}

/**
 * A short card under a block just revealed by "See it": what it is, the
 * lecture moment it came from, and when. Read-only and gone after a moment;
 * the block itself opens the full popover.
 */
export function RevealCallout({ item, top, alignRight }: RevealCalloutProps) {
  const recordingId = item.source_type === 'recording' ? item.source_id : null
  const { data: recording } = useSubstrate().useRecording(recordingId ?? '')
  const start = new Date(item.starts_at!)
  const end = new Date(item.ends_at!)
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000)
  // On the top layer, placed by UI SDK's `position` under the block and kept
  // inside the window (a narrow phone week has no room either side of a
  // column). Not a UI SDK popup: it takes no focus and no Escape.
  const anchorRef = useRef<HTMLSpanElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const anchor = anchorRef.current
    if (!el || !anchor) return
    el.showPopover()
    const stop = position(anchor, el, { side: 'bottom', align: alignRight ? 'end' : 'start', collisionPadding: 4 })
    return () => {
      stop()
      if (el.matches(':popover-open')) el.hidePopover()
    }
  }, [alignRight])
  return (
    <>
      <span ref={anchorRef} aria-hidden className={cn('pointer-events-none absolute h-0 w-0', alignRight ? 'right-1' : 'left-1')} style={{ top }} />
      <div
        ref={ref}
        popover="manual"
        data-testid="calendar-reveal"
        role="status"
        className="pointer-events-none m-0 w-max max-w-64 rounded-item border border-border-subtle bg-surface-raised px-3 py-2 text-text-primary shadow-pop"
      >
        <p className="text-body font-semibold text-text-primary">{item.title}</p>
        {recordingId && (
          <p className={cn('flex items-center gap-1 text-meta font-semibold', courseTone(item.course).ink)}>
            <AudioLines className="h-3 w-3 shrink-0" aria-hidden />
            <span className="min-w-0"><MomentSourceText label={momentSourceLabel(recording?.title ?? 'a lecture', item.source_offset_ms)} /></span>
          </p>
        )}
        <p className="text-meta tabular-nums text-text-secondary">
          {formatWeekday(start)} {formatSpan(start, end)} · {minutes} min
        </p>
      </div>
    </>
  )
}
