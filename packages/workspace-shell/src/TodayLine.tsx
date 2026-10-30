import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePlanItemList, usePreferences } from '@pls/substrate-client'
import { flushSync } from 'react-dom'
import { cn } from '@pls/shared-ui'
import { formatMinutes, localDayRange, type PlanItemOccurrence } from '@pls/substrate'
import { shortLineOptions, todayLine, todayStudyOptions } from './today-line'

const MINUTE_MS = 60_000

/** The current time, ticking each minute so "study time left" and the day roll over. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), MINUTE_MS)
    return () => clearInterval(id)
  }, [])
  return now
}

/**
 * "Tuesday · Chemistry 14:00 · shift 17:00-22:00 · 2h to study": a quiet
 * summary of today in the top bar. Shown only on a day with a class or shift,
 * and only in a form that fits whole. Wide screens get the full line (and
 * nothing between phone and wide, where the bar has no room); a phone gets
 * the `short` form under the tabs, "Tue · shift 17:00 · 2h to study".
 */
export function TodayLine({ short = false }: { short?: boolean }) {
  const now = useMinuteClock()
  // The student's study hours, study time per day and zone, as Help me plan uses them.
  const preferences = usePreferences()
  const browserZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const counting = useMemo(
    () => todayStudyOptions(preferences.data, preferences.isError, browserZone),
    [preferences.data, preferences.isError, browserZone],
  )
  // Today in the student's zone: the whole line is read there.
  const rows = localDayRange(now, counting?.timeZone ?? browserZone)
  const from = new Date(rows.start).toISOString()
  const to = new Date(rows.end).toISOString()
  const { data } = usePlanItemList({ from, to, statuses: ['open', 'done'] })

  const line = useMemo(
    () => (data && counting ? todayLine(data as PlanItemOccurrence[], { now, ...counting }) : null),
    [data, now, counting],
  )
  if (!line) return null

  const study = line.studyLeftMin > 0 ? `${formatMinutes(line.studyLeftMin)} to study` : null
  if (short) {
    const options = shortLineOptions(line.short, study)
    if (options.length === 0) return null
    // At least 40% of the row: when the scope pills leave less, the row wraps
    // and the line goes under them, so neither is cut short.
    return <TodayLineText options={options} strong={study} className="min-w-[40%] flex-1 basis-0" textClassName="text-meta" />
  }
  // Nothing left of the day to mention: like the phone, say nothing.
  if (line.events.length === 0 && !study) return null
  // The whole line, else without the weekday, which the student knows anyway.
  const full = [line.weekday, ...line.events, ...(study ? [study] : [])]
  return (
    <TodayLineText
      options={[full, full.slice(1)]}
      strong={study}
      className="hidden min-w-0 grow-[100] basis-0 xl:block"
      textClassName="text-body"
    />
  )
}

/**
 * Takes the bar's free space (never space the tabs or scope pills need) and
 * shows the first of `options` that fits whole, else nothing, since a
 * half-cut "Tues..." helps no one.
 */
function TodayLineText({ options, strong, className, textClassName }: {
  options: string[][]
  strong: string | null
  className: string
  textClassName: string
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const copyRefs = useRef<(HTMLParagraphElement | null)[]>([])
  /** Index of the option shown; -1 when none fits. */
  const [fit, setFit] = useState(0)
  const key = options.map((parts) => parts.join('|')).join('/')

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const copies = copyRefs.current.slice(0, options.length)
    const fitNow = () => {
      const room = box.clientWidth
      return copies.findIndex((el) => (el?.offsetWidth ?? Infinity) <= room)
    }
    // Before the first paint (a layout effect's update is synchronous).
    let shown = fitNow()
    setFit(shown)
    // A resize is seen after layout, before paint: commit a changed fit in
    // that same frame (flushSync), or React renders it a task later and the
    // clipped line can show for a frame or more on a busy machine. Only a
    // change needs it: a flushSync that renders nothing new, as in the
    // observer's initial callback, only trips the browser's "ResizeObserver
    // loop completed with undelivered notifications" error.
    const refit = () => {
      const next = fitNow()
      if (next === shown) return
      shown = next
      flushSync(() => setFit(next))
    }
    // The copies change size when the web font swaps in, the box when the bar does.
    const observer = new ResizeObserver(refit)
    for (const el of [box, ...copies]) if (el) observer.observe(el)
    let live = true
    void document.fonts?.ready.then(() => { if (live) refit() })
    return () => {
      live = false
      observer.disconnect()
    }
  }, [key, options.length])

  return (
    <div ref={boxRef} className={cn('relative overflow-hidden', className)}>
      {/* Off-screen copies, measured to pick what fits. */}
      {options.map((parts, i) => (
        <LineText
          key={i}
          ref={(el) => { copyRefs.current[i] = el }}
          parts={parts}
          strong={strong}
          className={cn('invisible absolute', textClassName)}
          aria-hidden
        />
      ))}
      <LineText
        parts={options[Math.max(fit, 0)] ?? options[0]}
        strong={strong}
        data-testid="today-line"
        title={options[0].join(' · ')}
        className={cn(textClassName, fit < 0 && 'invisible')}
      >
        <span className="sr-only">Today: </span>
      </LineText>
    </div>
  )
}

function LineText({ parts, strong, className, children, ...rest }: {
  parts: string[]
  strong: string | null
  className?: string
  children?: React.ReactNode
  ref?: React.Ref<HTMLParagraphElement>
} & React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p {...rest} className={cn('w-max whitespace-nowrap text-text-secondary', className)}>
      {children}
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <>
              <span aria-hidden className="px-1.5 text-text-muted">·</span>
              <span className="sr-only">, </span>
            </>
          )}
          {part === strong ? <span className="font-semibold text-text-primary">{part}</span> : part}
        </Fragment>
      ))}
    </p>
  )
}
