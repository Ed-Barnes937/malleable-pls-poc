import { type LensProps, useSubstrate } from '@pls/lens-framework'
import type { PlanItem } from '@pls/substrate'
import { formatTime } from '@pls/shared-ui'
import { CirclePlay } from 'lucide-react'

/**
 * "from: Mitochondrial DNA lecture, 9:00" for a to-do made from a lecture
 * moment (provenance `source_type = 'recording'`). Clicking focuses the board
 * on that lecture. Renders nothing for other to-dos.
 */
export function SourceLink({ item, onScopeChange }: { item: PlanItem; onScopeChange: LensProps['onScopeChange'] }) {
  const recordingId = item.source_type === 'recording' ? item.source_id : null
  const { data: recording } = useSubstrate().useRecording(recordingId ?? '')
  if (!recordingId) return null

  const title = recording?.title ?? 'a lecture'
  const at = item.source_offset_ms != null ? `, ${formatTime(item.source_offset_ms)}` : ''
  const label = `from: ${title}${at}`

  const focus = () => {
    onScopeChange?.({ recordingId })
    // TODO(T5): also jump the board's Transcript to `item.source_offset_ms`
    // once the Calendar's click-through-to-moment mechanism lands; reuse it
    // here so both widgets land on the same transcript moment.
  }

  if (!onScopeChange) {
    return <span className="truncate">{label}</span>
  }
  return (
    <button
      type="button"
      onClick={focus}
      title="Focus this lecture on the board"
      className="flex min-w-0 items-center gap-1 truncate text-accent/80 hover:text-accent hover:underline"
    >
      <CirclePlay className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}
