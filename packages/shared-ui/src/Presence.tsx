import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { MOTION_MS, useReducedMotion } from './motion'

/**
 * Something that comes and goes (a banner, a tray, an alert) leaves with the
 * shared motion instead of vanishing. While `children` is something, it is
 * shown as it is (the wrapper takes no box of its own). When it becomes
 * nothing, the last of it stays for the leave motion, out of reach and
 * hidden from assistive tech, with `-leaving` on its data-testids (so a test,
 * or a new one arriving, never takes it for the real thing), then goes.
 * Under reduced motion it goes at once.
 * Its arrival is the child's own (`motion-safe:animate-enter`).
 */
export function Presence({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion()
  const present = children !== null && children !== undefined && children !== false
  // Worked out while rendering, so the copy that leaves never misses a frame.
  const last = useRef<ReactNode>(null)
  const leaving = useRef(false)
  const [, setDone] = useState(0)
  if (present) {
    last.current = children
    leaving.current = false
  } else if (last.current !== null && !leaving.current) {
    if (reducedMotion) last.current = null
    else leaving.current = true
  }
  useEffect(() => {
    if (present || !leaving.current) return
    const t = setTimeout(() => {
      leaving.current = false
      last.current = null
      setDone((n) => n + 1)
    }, MOTION_MS)
    return () => clearTimeout(t)
  }, [present])

  // The same elements stay as they leave (and if they come back), so their
  // test ids are marked and unmarked in place, before the browser paints.
  const box = useRef<HTMLDivElement>(null)
  const isLeaving = !present && leaving.current
  useLayoutEffect(() => {
    for (const el of box.current?.querySelectorAll<HTMLElement>('[data-testid]') ?? []) {
      const id = el.dataset.testid!
      const marked = id.endsWith(LEAVING)
      if (isLeaving && !marked) el.dataset.testid = id + LEAVING
      else if (!isLeaving && marked) el.dataset.testid = id.slice(0, -LEAVING.length)
    }
  })

  if (present) return <div ref={box} className="contents">{children}</div>
  if (!leaving.current) return null
  return (
    <div ref={box} inert aria-hidden data-leaving="" className="pointer-events-none origin-top motion-safe:animate-leave">
      {last.current}
    </div>
  )
}

const LEAVING = '-leaving'
