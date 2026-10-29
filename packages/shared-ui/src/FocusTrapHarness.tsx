import { useRef, useState } from 'react'
import { useFocusTrap } from './useFocusTrap'

/** A trap with three buttons, plain buttons before and after it, and an optional inner modal. */
export function FocusTrapHarness({ withInner = false }: { withInner?: boolean }) {
  const [open, setOpen] = useState(true)
  const ref = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, open)
  // The inner modal traps itself, like Activity stacked over the board menu.
  useFocusTrap(innerRef, withInner)
  return (
    <div>
      <button>before</button>
      {open && (
        <div ref={ref} tabIndex={-1} role="dialog" aria-label="trap">
          <button>one</button>
          <button>two</button>
          <button>three</button>
          <button onClick={() => setOpen(false)}>close</button>
        </div>
      )}
      {withInner && (
        <div ref={innerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="inner">
          <button>inner one</button>
          <button>inner two</button>
        </div>
      )}
      <button>after</button>
    </div>
  )
}
