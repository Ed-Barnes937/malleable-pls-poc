import type { PlanItemOccurrence } from '@pls/substrate'
import { useSubstrate } from '@pls/lens-framework'
import { cn, courseTone, formatDuration, fromMomentLabel } from '@pls/shared-ui'
import { AudioLines } from 'lucide-react'
import { formatSpan, formatWeekday } from './time'

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
  return (
    <div
      data-testid="calendar-reveal"
      role="status"
      className={cn(
        'pointer-events-none absolute z-30 w-max max-w-64 rounded-item border border-border-subtle bg-surface-raised px-3 py-2 shadow-pop',
        alignRight ? 'right-1' : 'left-1',
      )}
      style={{ top }}
    >
      <p className="text-body font-semibold text-text-primary">{item.title}</p>
      {recordingId && (
        <p className={cn('flex items-center gap-1 text-meta font-semibold', courseTone(item.course).ink)}>
          <AudioLines className="h-3 w-3 shrink-0" aria-hidden />
          {fromMomentLabel(recording?.title ?? 'a lecture', item.source_offset_ms)}
        </p>
      )}
      <p className="text-meta tabular-nums text-text-secondary">
        {formatWeekday(start)} {formatSpan(start, end)} · {formatDuration(minutes)}
      </p>
    </div>
  )
}
