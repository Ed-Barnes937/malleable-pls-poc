/**
 * PROTOTYPE p5 (flow audit, proposal 5: "a canvas that's hard to break").
 * Throwaway: lives on the proto/p5-canvas branch only and is never merged.
 *
 * Question for Ed: how do neighbours react when a widget is resized or
 * dropped, and what does Tidy up do? Switch with `?p5=a|b|c` (no param = the
 * current app, for "before").
 *   A  push   - neighbours are pushed down live during a resize or drag.
 *   B  nudge  - free placement; on drop a widget left mostly covered moves to
 *               the nearest free spot, with motion.
 *   C  snap   - the moved widget snaps to the nearest free slot on drop, with
 *               a preview outline while dragging or resizing.
 * All three: Tidy up fills the view (Calendar first, sizes kept where they
 * fit) with Undo, and a widget can't be dropped or grown past the canvas edge.
 */
import { create } from 'zustand'
import { DEFAULT_SIZE_CONSTRAINTS, type PanelItem } from './canvas-store'

export type P5Variant = 'off' | 'a' | 'b' | 'c'

export const P5_VARIANTS: { key: P5Variant; name: string; blurb: string }[] = [
  { key: 'off', name: 'Today', blurb: 'The current app, for comparison.' },
  { key: 'a', name: 'Push', blurb: 'Neighbours are pushed down live while you resize or drag.' },
  { key: 'b', name: 'Nudge', blurb: 'Free placement; on drop, a widget left mostly covered slides to the nearest free spot.' },
  { key: 'c', name: 'Snap', blurb: 'An outline shows the free slot the widget will land in; it snaps there on drop.' },
]

function readVariant(): P5Variant {
  if (typeof window === 'undefined') return 'off'
  const v = new URLSearchParams(window.location.search).get('p5')
  return v === 'a' || v === 'b' || v === 'c' ? v : 'off'
}

interface P5State {
  variant: P5Variant
  setVariant: (v: P5Variant) => void
  /** Variant C: where the widget being moved will land. */
  preview: Rect | null
  setPreview: (r: Rect | null) => void
  /** Widgets just moved by the canvas (B nudge, A push), briefly highlighted. */
  moved: string[]
  flashMoved: (ids: string[]) => void
  /** Last thing the canvas did on its own, shown in the switcher. */
  lastEvent: string
  setLastEvent: (s: string) => void
}

let flashTimer: ReturnType<typeof setTimeout> | undefined

export const useP5Store = create<P5State>((set) => ({
  variant: readVariant(),
  setVariant: (variant) => {
    const url = new URL(window.location.href)
    if (variant === 'off') url.searchParams.delete('p5')
    else url.searchParams.set('p5', variant)
    window.history.replaceState(null, '', url)
    set({ variant, preview: null, lastEvent: '' })
  },
  preview: null,
  setPreview: (preview) => set({ preview }),
  moved: [],
  flashMoved: (ids) => {
    if (ids.length === 0) return
    clearTimeout(flashTimer)
    set({ moved: ids })
    flashTimer = setTimeout(() => set({ moved: [] }), 1400)
  },
  lastEvent: '',
  setLastEvent: (lastEvent) => set({ lastEvent }),
}))

export const p5Variant = () => useP5Store.getState().variant

/* ── Geometry ── */

export interface Rect { x: number; y: number; w: number; h: number }

export const GAP = 20

export const rectOf = (p: PanelItem): Rect => ({ x: p.pos_x, y: p.pos_y, w: p.width, h: p.height })

function intersection(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** Overlaps, or comes closer than `gap`. */
function touches(a: Rect, b: Rect, gap = 0): boolean {
  return Math.min(a.x + a.w + gap, b.x + b.w) > Math.max(a.x - gap, b.x)
    && Math.min(a.y + a.h + gap, b.y + b.h) > Math.max(a.y - gap, b.y)
}

/** Share of `r` covered by `by`, 0..1. */
export function coverage(r: Rect, by: Rect): number {
  return intersection(r, by) / (r.w * r.h)
}

/** Inside the canvas: never past the left, right or top edge, and never past `bottom`. */
export function keepInside(r: Rect, canvas: { width: number; bottom: number }): Rect {
  return {
    ...r,
    x: Math.max(0, Math.min(r.x, canvas.width - r.w)),
    y: Math.max(0, Math.min(r.y, canvas.bottom - r.h)),
  }
}

/** Nearest spot to `r` (by distance of the top-left) that keeps GAP from every rect in `others`. */
export function nearestFreeSpot(r: Rect, others: Rect[], canvas: { width: number; height: number }): Rect | null {
  let best: Rect | null = null
  let bestD = Infinity
  const maxY = Math.max(canvas.height - r.h - GAP, GAP)
  for (let y = GAP; y <= maxY; y += 10) {
    for (let x = GAP; x <= canvas.width - r.w - GAP; x += 10) {
      const c = { ...r, x, y }
      if (others.some((o) => touches(c, o, GAP - 1))) continue
      const d = Math.hypot(x - r.x, y - r.y)
      if (d < bestD) { bestD = d; best = c }
    }
  }
  return best
}

/* ── A: push ── */

/**
 * Neighbours pushed down out of the way of `moving`, from where they were at
 * the start of the gesture (so they come back if the widget moves away).
 */
export function pushLayout(movingId: string, moving: Rect, start: PanelItem[]): Map<string, { x: number; y: number }> {
  const placed: Rect[] = [moving]
  const out = new Map<string, { x: number; y: number }>()
  const others = start.filter((p) => p.id !== movingId).sort((a, b) => a.pos_y - b.pos_y || a.pos_x - b.pos_x)
  for (const p of others) {
    const r = rectOf(p)
    for (let guard = 0; guard < 50; guard++) {
      const hit = placed.find((o) => touches(r, o, GAP - 1))
      if (!hit) break
      r.y = hit.y + hit.h + GAP
    }
    placed.push(r)
    out.set(p.id, { x: r.x, y: r.y })
  }
  return out
}

/* ── B: nudge ── */

/** Widgets at least this much covered by the dropped one are nudged. */
export const NUDGE_COVERAGE = 0.5

export function nudgeLayout(movedId: string, panels: PanelItem[], canvas: { width: number; height: number }): Map<string, { x: number; y: number }> {
  const moved = panels.find((p) => p.id === movedId)
  const out = new Map<string, { x: number; y: number }>()
  if (!moved) return out
  const movedRect = rectOf(moved)
  const fixed = panels.filter((p) => p.id !== movedId && coverage(rectOf(p), movedRect) < NUDGE_COVERAGE).map(rectOf)
  const placed: Rect[] = [movedRect, ...fixed]
  for (const p of panels) {
    if (p.id === movedId || coverage(rectOf(p), movedRect) < NUDGE_COVERAGE) continue
    const r = rectOf(p)
    const spot = nearestFreeSpot(r, placed, canvas)
      // Nowhere free in view: the row under the lowest widget (the board scrolls).
      ?? { ...r, x: GAP, y: Math.max(...placed.map((o) => o.y + o.h)) + GAP }
    placed.push(spot)
    out.set(p.id, { x: spot.x, y: spot.y })
  }
  return out
}

/* ── C: snap ── */

/** Where a dragged widget lands: where it is if free, else the nearest free slot. */
export function snapDrop(movingId: string, r: Rect, panels: PanelItem[], canvas: { width: number; height: number }): Rect {
  const others = panels.filter((p) => p.id !== movingId).map(rectOf)
  if (!others.some((o) => touches(r, o))) return r
  return nearestFreeSpot(r, others, canvas)
    ?? { ...r, x: GAP, y: Math.max(...others.map((o) => o.y + o.h)) + GAP }
}

/**
 * Where a resize lands: the requested size, shrunk back towards the start
 * size until it no longer covers a neighbour it didn't already overlap.
 */
export function snapResize(movingId: string, start: Rect, requested: Rect, panels: PanelItem[]): Rect {
  const others = panels.filter((p) => p.id !== movingId).map(rectOf).filter((o) => !touches(start, o))
  for (let t = 1; t >= 0; t -= 0.01) {
    const c = {
      x: start.x + (requested.x - start.x) * t,
      y: start.y + (requested.y - start.y) * t,
      w: start.w + (requested.w - start.w) * t,
      h: start.h + (requested.h - start.h) * t,
    }
    if (!others.some((o) => touches(c, o, GAP - 1))) return c
  }
  return start
}

/* ── Tidy up ── */

const minW = (p: PanelItem) => p.constraints?.minWidth ?? DEFAULT_SIZE_CONSTRAINTS.minWidth
const minH = (p: PanelItem) => p.constraints?.minHeight ?? DEFAULT_SIZE_CONSTRAINTS.minHeight

/**
 * Fills the view. The Calendar (else the biggest widget) takes the left
 * column at full height, keeping its width where the others still fit
 * beside it. The rest fill columns to its right in reading order: each keeps
 * its height where the column has room (the last one stretches to the
 * bottom), and heights shrink in proportion, never below a widget's minimum,
 * where it doesn't. Nothing ends up below the fold unless the minimums can't
 * fit, and then it scrolls rather than overlapping.
 */
export function tidyLayout(panels: PanelItem[], canvas: { width: number; height: number }): PanelItem[] {
  if (panels.length === 0) return panels
  const W = canvas.width
  const H = canvas.height
  const fullH = H - 2 * GAP
  const lead = panels.find((p) => p.lensType === 'calendar')
    ?? [...panels].sort((a, b) => b.width * b.height - a.width * a.height)[0]!
  const rest = panels.filter((p) => p.id !== lead.id).sort((a, b) => a.pos_y - b.pos_y || a.pos_x - b.pos_x)

  if (rest.length === 0) {
    return [{ ...lead, pos_x: GAP, pos_y: GAP, width: W - 2 * GAP, height: Math.max(fullH, minH(lead)), z_index: 1 }]
  }

  // The fewest columns where each column's heights fit, kept or shrunk by no
  // more than a quarter (and never below a widget's minimum).
  const restMinW = Math.max(...rest.map(minW))
  const fits = (c: PanelItem[]) => {
    const gaps = GAP * (c.length - 1)
    const kept = c.reduce((s, p) => s + p.height, 0)
    if (kept + gaps <= fullH) return true
    return (fullH - gaps) / kept >= 0.75 && c.reduce((s, p) => s + minH(p), 0) + gaps <= fullH
  }
  let cols = 1
  for (; cols < rest.length; cols++) {
    if (chunk(rest, cols).every(fits)) break
  }
  let columns = chunk(rest, cols)
  // The lead keeps its width where the columns still get their minimum width.
  const room = (n: number) => W - 3 * GAP - (n - 1) * GAP
  let leadW = Math.max(minW(lead), Math.min(lead.width, room(cols) - cols * restMinW))
  while (cols > 1 && room(cols) - leadW < cols * restMinW) { cols--; columns = chunk(rest, cols) ; leadW = Math.max(minW(lead), Math.min(lead.width, room(cols) - cols * restMinW)) }

  const out: PanelItem[] = [{ ...lead, pos_x: GAP, pos_y: GAP, width: leadW, height: Math.max(fullH, minH(lead)), z_index: 1 }]
  // Columns share the remaining width in proportion to their widest widget.
  const restW = W - 2 * GAP - leadW - GAP * cols
  const want = columns.map((c) => Math.max(...c.map((p) => p.width)))
  const total = want.reduce((s, w) => s + w, 0)
  let x = GAP + leadW + GAP
  let z = 2
  columns.forEach((col, ci) => {
    const colW = ci === columns.length - 1 ? W - GAP - x : Math.round(restW * want[ci]! / total)
    const kept = col.reduce((s, p) => s + p.height, 0) + GAP * (col.length - 1)
    const scale = kept > fullH ? (fullH - GAP * (col.length - 1)) / (kept - GAP * (col.length - 1)) : 1
    let y = GAP
    col.forEach((p, i) => {
      const last = i === col.length - 1
      const h = last ? Math.max(minH(p), GAP + fullH - y) : Math.max(minH(p), Math.round(p.height * scale))
      out.push({ ...p, pos_x: x, pos_y: y, width: Math.max(minW(p), colW), height: h, z_index: z++ })
      y += h + GAP
    })
    x += colW + GAP
  })
  return out
}

/** Splits `items` in order into `n` runs of near-equal length. */
function chunk<T>(items: T[], n: number): T[][] {
  const out: T[][] = []
  const size = Math.ceil(items.length / n)
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** For the switcher's readout: any widget more than 0% covered by another. */
export function overlapReport(panels: PanelItem[], label: (p: PanelItem) => string): string {
  const parts: string[] = []
  for (const p of panels) {
    let worst = 0
    for (const o of panels) {
      if (o.id === p.id || o.z_index < p.z_index) continue
      worst = Math.max(worst, coverage(rectOf(p), rectOf(o)))
    }
    if (worst > 0.005) parts.push(`${label(p)} ${Math.round(worst * 100)}% covered`)
  }
  return parts.length ? parts.join(', ') : 'No overlaps'
}
