import { useState } from 'react'
import { type LensProps, useSubstrate } from '@pls/lens-framework'
import type { PlanItem } from '@pls/substrate'
import { cn, courseTone, fromMomentLabel } from '@pls/shared-ui'
import { AudioLines } from 'lucide-react'

/** Where the moment went: `nowhere` when no board has a Transcript. */
type MomentState = 'opening' | 'shown' | 'nowhere' | 'failed'

interface SourceLinkProps {
  item: PlanItem
  onScopeChange: LensProps['onScopeChange']
  onShowMoment: LensProps['onShowMoment']
}

/**
 * "From Mitochondrial DNA · 9:00" for a to-do made from a lecture
 * moment (provenance `source_type = 'recording'`). Clicking lands on that
 * moment in a Transcript (the shell's `onShowMoment`, as the Calendar does:
 * this board's, or another board's when this one has none). Without that, it
 * focuses the lecture. Renders nothing for other to-dos.
 */
export function SourceLink({ item, onScopeChange, onShowMoment }: SourceLinkProps) {
  const recordingId = item.source_type === 'recording' ? item.source_id : null
  const { data: recording } = useSubstrate().useRecording(recordingId ?? '')
  const [state, setState] = useState<MomentState | null>(null)
  if (!recordingId) return null

  const label = fromMomentLabel(recording?.title ?? 'a lecture', item.source_offset_ms)

  const show = async () => {
    if (!onShowMoment) {
      if (recording?.lecture_id) onScopeChange?.({ lectureId: recording.lecture_id })
      return
    }
    setState('opening')
    try {
      const result = await onShowMoment({ recordingId, offsetMs: item.source_offset_ms ?? 0 })
      setState(result === 'no-viewer' ? 'nowhere' : result)
    } catch {
      setState('failed')
    }
  }

  if (!onShowMoment && !onScopeChange) {
    return <span className="truncate">{label}</span>
  }
  return (
    <>
      <button
        type="button"
        onClick={() => void show()}
        title={onShowMoment ? 'Go to this moment' : 'Focus this lecture on the board'}
        className={cn(
          'flex min-w-0 items-center gap-1 truncate text-meta font-semibold hover:underline',
          item.course ? courseTone(item.course).ink : 'text-accent',
        )}
      >
        <AudioLines className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </button>
      {state === 'nowhere' && (
        <span data-testid="todo-moment" className="basis-full">None of your boards has a Transcript yet.</span>
      )}
      {state === 'failed' && (
        <span data-testid="todo-moment" className="basis-full">Couldn't open the moment just now.</span>
      )}
    </>
  )
}
