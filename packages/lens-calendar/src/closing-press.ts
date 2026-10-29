/**
 * The press that closes a calendar popover. CalendarLens closes the popover
 * on pointerdown and lets the press carry on to what is under it (a block
 * starts its drag, a button works); what is under it asks here whether to
 * stand down: empty time starts no new block, and a click on the block (or
 * due marker) the popover was open on leaves it closed (a toggle).
 */
type ClosingPress = {
  /** Occurrence key of the item the popover was open on; null for a new block's. */
  key: string | null
  /** The press only closes: e.g. a save is still in flight, so it moves nothing. */
  closeOnly: boolean
}

const closingPresses = new WeakMap<Event, ClosingPress>()

export function markClosingPress(e: Event, press: ClosingPress) {
  closingPresses.set(e, press)
}

/** Whether this press closed a popover (so it shouldn't also start a new block). */
export function closedPopover(e: Event) {
  return closingPresses.has(e)
}

/** Whether this press closed the popover open on item `key` (a click on it then only closes it). */
export function closedPopoverOf(e: Event, key: string) {
  return closingPresses.get(e)?.key === key
}

/** Whether this press should only close the popover and start nothing, not even a block drag. */
export function pressOnlyCloses(e: Event) {
  return closingPresses.get(e)?.closeOnly === true
}
