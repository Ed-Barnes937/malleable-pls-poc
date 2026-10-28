import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePlanItemList, useWorkspacePanels } from '@pls/substrate-client'
import { flushSync } from 'react-dom'
import { cn } from '@pls/shared-ui'
import { formatMinutes, type PlanItemOccurrence } from '@pls/substrate'
import { todayLine, todayRange } from './today-line'

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

/** The board's Calendar study time per day, so the line agrees with its Help me plan. */
function useBoardStudyMinPerDay(workspaceId: string): number | undefined {
  const { data: panels } = useWorkspacePanels(workspaceId)
  return useMemo(() => {
    const rows = (panels ?? []) as unknown as { lens_type: string; config: Record<string, unknown> | null }[]
    const value = rows.find((p) => p.lens_type === 'calendar')?.config?.studyMinPerDay
    return typeof value === 'number' && value > 0 ? value : undefined
  }, [panels])
}

/**
 * "Tuesday · Chemistry 14:00 · shift 17:00-22:00 · 2h to study": a
 * quiet summary of today in the top bar. Shown only where the bar has room
 * (wide screens, and only when the whole line fits) and only on a day with
 * a class or shift.
 */
export function TodayLine({ workspaceId }: { workspaceId: string }) {
  const now = useMinuteClock()
  const day = todayRange(now)
  const from = new Date(day.start).toISOString()
  const to = new Date(day.end).toISOString()
  const { data } = usePlanItemList({ from, to, statuses: ['open', 'done'] })
  const studyMinPerDay = useBoardStudyMinPerDay(workspaceId)
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  const line = useMemo(
    () => (data ? todayLine(data as PlanItemOccurrence[], { now, timeZone, studyMinPerDay }) : null),
    [data, now, timeZone, studyMinPerDay],
  )
  if (!line) return null

  const study = line.studyLeftMin > 0 ? `${formatMinutes(line.studyLeftMin)} to study` : null
  return <TodayLineText weekday={line.weekday} events={line.events} study={study} />
}

type Fit = 'full' | 'no-weekday' | 'none'

/**
 * Takes the bar's free space (never space the tabs or scope chip need). The
 * whole line if it fits; else without the weekday, which the student knows
 * anyway; else nothing, since a half-cut "Tues..." helps no one.
 */
function TodayLineText({ weekday, events, study }: { weekday: string; events: string[]; study: string | null }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const fullRef = useRef<HTMLParagraphElement>(null)
  const shortRef = useRef<HTMLParagraphElement>(null)
  const [fit, setFit] = useState<Fit>('full')
  const full = [weekday, ...events, ...(study ? [study] : [])]
  const short = full.slice(1)
  const key = full.join('|')

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const fitNow = (): Fit => {
      const room = box.clientWidth
      return (fullRef.current?.offsetWidth ?? Infinity) <= room ? 'full'
        : (shortRef.current?.offsetWidth ?? Infinity) <= room ? 'no-weekday' : 'none'
    }
    // Before the first paint (a layout effect's update is synchronous).
    setFit(fitNow())
    // A resize is seen after layout, before paint: commit the new fit in that
    // same frame (flushSync), or React renders it a task later and the
    // clipped line can show for a frame or more on a busy machine.
    const refit = () => flushSync(() => setFit(fitNow()))
    // The copies change size when the web font swaps in, the box when the bar does.
    const observer = new ResizeObserver(refit)
    for (const el of [box, fullRef.current, shortRef.current]) if (el) observer.observe(el)
    let live = true
    void document.fonts?.ready.then(() => { if (live) refit() })
    return () => {
      live = false
      observer.disconnect()
    }
  }, [key])

  return (
    <div ref={boxRef} className="relative hidden min-w-0 grow-[100] basis-0 overflow-hidden xl:block">
      {/* Off-screen copies, measured to pick what fits. */}
      <LineText ref={fullRef} parts={full} strong={study} className="invisible absolute" aria-hidden />
      <LineText ref={shortRef} parts={short} strong={study} className="invisible absolute" aria-hidden />
      <LineText
        parts={fit === 'full' ? full : short}
        strong={study}
        data-testid="today-line"
        title={full.join(' · ')}
        className={cn(fit === 'none' && 'invisible')}
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
    <p {...rest} className={cn('w-max whitespace-nowrap text-body text-text-secondary', className)}>
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
