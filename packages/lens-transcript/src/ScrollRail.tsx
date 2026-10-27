import { useLayoutEffect, useRef, useState } from 'react'
import { cn, formatTime, TAG_STYLES } from '@pls/shared-ui'

/** Each mark's target is at least this tall (WCAG 2.5.8), so marks never sit closer than this. */
export const RAIL_TARGET_PX = 24

/**
 * Where each mark goes on a rail `height` px tall: at its place in the
 * lecture (`fraction`, 0-1, in order), nudged apart so no two targets
 * (`gap` px tall, centred on the mark) overlap, and kept on the rail.
 * Returns each target's top edge in px.
 */
export function spreadMarks(fractions: number[], height: number, gap = RAIL_TARGET_PX): number[] {
  const max = Math.max(0, height - gap)
  const tops: number[] = []
  for (const f of fractions) {
    const ideal = Math.min(max, Math.max(0, f * height - gap / 2))
    tops.push(tops.length ? Math.max(ideal, tops[tops.length - 1] + gap) : ideal)
  }
  // Pushed past the end: pull back from the bottom, keeping the spacing.
  for (let i = tops.length - 1; i >= 0; i--) {
    const limit = i === tops.length - 1 ? max : tops[i + 1] - gap
    if (tops[i] > limit) tops[i] = limit
  }
  return tops.map((t) => Math.max(0, t))
}

export interface RailMark {
  segmentId: string
  startMs: number
  /** Leading tag label: 'confused', 'key-point' or 'question'. */
  label: string
}

const TAG_WORDS: Record<string, string> = { confused: 'Confused', 'key-point': 'Key point', question: 'Question' }

/**
 * Scroll rail beside the transcript: every tagged moment in the lecture,
 * where it falls. Each mark is a button that goes to its moment.
 */
export function ScrollRail({ marks, lectureEnd, onGo }: { marks: RailMark[]; lectureEnd: number; onGo: (segmentId: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setHeight(el.clientHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const tops = spreadMarks(marks.map((m) => m.startMs / lectureEnd), height)

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Tagged moments"
      data-testid="transcript-rail"
      className="relative w-6 shrink-0"
    >
      {/* The track: a thin line down the middle. */}
      <div aria-hidden className="absolute inset-y-0 left-1/2 w-2 -translate-x-1/2 rounded-full bg-surface-overlay" />
      {height > 0 && marks.map((mark, i) => {
        const name = `${TAG_WORDS[mark.label] ?? mark.label} at ${formatTime(mark.startMs)}`
        return (
          <button
            key={mark.segmentId}
            type="button"
            aria-label={name}
            title={name}
            onClick={() => onGo(mark.segmentId)}
            className="group absolute inset-x-0 flex items-center justify-center rounded-item focus-visible:outline-2 focus-visible:outline-accent"
            style={{ top: tops[i], height: RAIL_TARGET_PX }}
          >
            <span aria-hidden className={cn('h-2 w-2 rounded-full transition-transform group-hover:scale-150', TAG_STYLES[mark.label]?.mark)} />
          </button>
        )
      })}
    </div>
  )
}
