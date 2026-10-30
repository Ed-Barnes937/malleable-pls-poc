import { forwardRef, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@pls/shared-ui'

export interface ScopePillProps {
  /** The select's accessible name, e.g. "Course". */
  label: string
  value: string
  onChange: (value: string) => void
  /** The `<option>`s (and any separator). */
  children: ReactNode
  /** What the pill reads: the chosen option, in its short form. */
  text: string
  /** Full text for the tooltip when `text` may be cut short. */
  title?: string
  /** A course colour dot before the text (a `bg-` class). */
  dotClassName?: string
  /** Quieter text, for an unset choice ("No lecture"). */
  muted?: boolean
  className?: string
  'data-testid'?: string
}

/**
 * A content-sized dropdown pill for the board header: a styled label (dot,
 * text cut with an ellipsis, chevron) under a transparent native `<select>`
 * that fills it. The select keeps the native semantics, keyboard and the
 * phone's own picker; the label only shows its choice.
 */
export const ScopePill = forwardRef<HTMLSelectElement, ScopePillProps>(function ScopePill(
  { label, value, onChange, children, text, title, dotClassName, muted = false, className, 'data-testid': testId },
  ref,
) {
  return (
    <div
      data-testid={testId}
      title={title ?? text}
      className={cn(
        'relative inline-flex h-10 min-w-0 items-center gap-1.5 rounded-full bg-surface-overlay pr-2.5 pl-3 text-body font-semibold text-text-primary transition-colors hover:bg-border-subtle sm:h-9',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
        className,
      )}
    >
      {dotClassName && <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', dotClassName)} />}
      <span aria-hidden data-testid="scope-pill-text" className={cn('min-w-0 truncate', muted && 'font-normal text-text-secondary')}>
        {text}
      </span>
      <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-text-muted" />
      <select
        ref={ref}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Sized to the pill (WebKit otherwise keeps a native-height hit
        // area), and 16px (`text-title`) so iOS doesn't zoom the page when it opens.
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full text-title opacity-0 focus:outline-none"
      >
        {children}
      </select>
    </div>
  )
})
