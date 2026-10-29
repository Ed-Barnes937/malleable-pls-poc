/**
 * A tap (touch or pen) fires its compatibility mouse events and its click
 * only after the finger lifts, at the point tapped, on whatever is there by
 * then. The calendar opens a popover as the finger lifts (pointerup), and on
 * a phone that popover sits under the finger, so the tap's own click would
 * press the control it landed on (Mark done, Go to moment, Save).
 *
 * `swallowTapFollowUp`, called as a tap opens a popover, cancels the rest of
 * that tap: its mousedown (which would move focus), mouseup and click. The
 * next press (pointerdown) or key ends it, as does the click itself; a tap
 * that never sends one (e.g. a long press) lets it lapse after a second.
 * A mouse click is not affected: its click goes where the press started.
 */
const FOLLOW_UPS = ['mousedown', 'mouseup', 'click'] as const
const LAPSE_MS = 1000

export function swallowTapFollowUp(pointerType: string) {
  if (pointerType !== 'touch' && pointerType !== 'pen') return
  const swallow = (e: Event) => {
    e.preventDefault()
    e.stopImmediatePropagation()
    if (e.type === 'click') end()
  }
  const end = () => {
    clearTimeout(lapse)
    for (const type of FOLLOW_UPS) window.removeEventListener(type, swallow, true)
    window.removeEventListener('pointerdown', end, true)
    window.removeEventListener('keydown', end, true)
  }
  for (const type of FOLLOW_UPS) window.addEventListener(type, swallow, true)
  window.addEventListener('pointerdown', end, true)
  window.addEventListener('keydown', end, true)
  const lapse = setTimeout(end, LAPSE_MS)
}
