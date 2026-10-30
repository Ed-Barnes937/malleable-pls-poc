import { forwardRef, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@pls/shared-ui'

/** What the pill reads for a value. */
export interface ScopePillFace {
  /** The choice in its short form. */
  text: string
  /** Full text for the tooltip when `text` may be cut short (defaults to `text`). */
  title?: string
  /** A course colour dot before the text (a `bg-` class). */
  dotClassName?: string
  /** Quieter text, for an unset choice ("No lecture"). */
  muted?: boolean
}

export interface ScopePillProps {
  /** The select's accessible name, e.g. "Course". */
  label: string
  value: string
  /** A choice made: on a pick from the open list, or a keyboard change once it is confirmed. */
  onChange: (value: string) => void
  /** The `<option>`s (and any separator). */
  children: ReactNode
  /** What the pill reads for `value` (and for a keyboard choice not yet confirmed). */
  describe: (value: string) => ScopePillFace
  className?: string
  'data-testid'?: string
}

/** Keys that confirm or drop a keyboard choice rather than make one. */
const NOT_A_CHOICE = new Set(['Tab', 'Enter', 'Escape', 'Shift', 'Control', 'Alt', 'Meta'])

/**
 * A content-sized dropdown pill for the board header: a styled label (dot,
 * text cut with an ellipsis, chevron) under a transparent native `<select>`
 * that fills it. The select keeps the native semantics, keyboard and the
 * phone's own picker; the label only shows its choice.
 *
 * On Windows and Linux, arrow keys and type-ahead on a closed select change
 * its value (and fire `change`) on every press, so stepping through the list
 * would write each option on the way. A change that comes from a key press is
 * therefore only a draft: the pill reads it, and Enter or leaving the pill
 * confirms it (Escape drops it). A pick from the open list (mouse, touch,
 * the Mac's menu, a phone's picker) is confirmed at once.
 */
export const ScopePill = forwardRef<HTMLSelectElement, ScopePillProps>(function ScopePill(
  { label, value, onChange, children, describe, className, 'data-testid': testId },
  ref,
) {
  const [draft, setDraft] = useState<string | null>(null)
  // The value the draft was made over: a new value from elsewhere drops it.
  const [draftOver, setDraftOver] = useState(value)
  if (draft !== null && draftOver !== value) {
    setDraft(null)
    setDraftOver(value)
  }
  // Set by a key press until the browser has handled it: a `change` in that
  // window came from the key (a closed select's arrows or type-ahead).
  const keyChange = useRef(false)

  const shown = draft ?? value
  const face = describe(shown)

  const confirm = () => {
    if (draft === null) return
    setDraft(null)
    if (draft !== value) onChange(draft)
  }

  return (
    <div
      data-testid={testId}
      data-draft={draft !== null || undefined}
      title={face.title ?? face.text}
      className={cn(
        // `overflow-hidden`: nothing inside (the select's own option text in
        // WebKit) makes the pill wider than its box.
        'relative inline-flex h-10 min-w-0 items-center gap-1.5 overflow-hidden rounded-full bg-surface-overlay pr-2.5 pl-3 text-body font-semibold text-text-primary transition-colors hover:bg-border-subtle sm:h-9',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
        className,
      )}
    >
      {face.dotClassName && <span aria-hidden data-testid="scope-pill-dot" className={cn('h-2 w-2 shrink-0 rounded-full', face.dotClassName)} />}
      {/* A grid track from 0 to the text's width: the pill can be squeezed
          down to its own minimum (the ellipsis), but asks for the whole text. */}
      <span aria-hidden className="grid min-w-0 grid-cols-[minmax(0,max-content)]">
        <span data-testid="scope-pill-text" className={cn('truncate', face.muted && 'font-normal text-text-secondary')}>
          {face.text}
        </span>
      </span>
      <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-text-muted" />
      <select
        ref={ref}
        aria-label={label}
        value={shown}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (draft !== null) e.preventDefault()
            confirm()
          } else if (e.key === 'Escape') {
            if (draft === null) return
            // Not the board menu's or a dialog's Escape.
            e.preventDefault()
            e.stopPropagation()
            setDraft(null)
          } else if (!NOT_A_CHOICE.has(e.key)) {
            keyChange.current = true
            // After the browser's own handling of the key, which is where its `change` fires.
            setTimeout(() => { keyChange.current = false }, 0)
          }
        }}
        onChange={(e) => {
          const next = e.target.value
          if (keyChange.current) {
            setDraftOver(value)
            setDraft(next)
          } else {
            setDraft(null)
            if (next !== value) onChange(next)
          }
        }}
        onBlur={confirm}
        // Sized to the pill (WebKit otherwise keeps a native-height hit
        // area), and 16px (`text-title`) so iOS doesn't zoom the page when it opens.
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full text-title opacity-0 focus:outline-none"
      >
        {children}
      </select>
    </div>
  )
})
