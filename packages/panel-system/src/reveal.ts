import { PLACEMENT_GAP } from './geometry'

/**
 * Scrolls the board (the `[data-canvas-scroll]` element) just enough to show
 * the panel `panelId`, keeping a little air around it; a panel taller than
 * the view shows from its top. Returns false when the panel isn't rendered
 * under `root` yet.
 */
export function scrollPanelIntoView(root: ParentNode | null | undefined, panelId: string): boolean {
  const el = [...(root?.querySelectorAll<HTMLElement>('[data-panel-id]') ?? [])].find((p) => p.dataset.panelId === panelId)
  const scroller = el?.closest<HTMLElement>('[data-canvas-scroll]')
  if (!el || !scroller) return false
  // A free-layout panel animates `top` and `height` (e.g. leaving fullscreen),
  // so read its layout target rather than the mid-transition box.
  const top = Number(el.dataset.layoutTop ?? el.offsetTop)
  const bottom = top + Number(el.dataset.layoutHeight ?? el.offsetHeight)
  const viewTop = scroller.scrollTop
  const view = scroller.clientHeight
  if (top >= viewTop && bottom <= viewTop + view) return true
  const target = top < viewTop || bottom - top > view ? top - PLACEMENT_GAP : bottom + PLACEMENT_GAP - view
  if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  else scroller.scrollTop = Math.max(0, target)
  return true
}
