import type { DaySegment } from './layout'

/**
 * Blocks are drawn to scale, so a 30-minute block is visibly longer than a
 * 20-minute one; nothing shorter than this many minutes' worth, though.
 */
const MIN_BLOCK_MIN = 15
/**
 * Shorter than this, a block is one compact line: its title, which may
 * overhang the box by a pixel or two and is drawn above the blocks around it,
 * so the next block never paints over it.
 */
export const COMPACT_BLOCK_PX = 18

/** A block's height on the grid: proportional to its length, with a 2px gap below. */
export function blockHeight(seg: { startMin: number; endMin: number }, hourPx: number): number {
  return (Math.max(MIN_BLOCK_MIN, seg.endMin - seg.startMin) / 60) * hourPx - 2
}

/** A short block's caption: one line of `text-meta` (16px). */
export const CAPTION_PX = 16

export type CaptionSide = 'below' | 'above' | null

type Seg = Pick<DaySegment, 'key' | 'startMin' | 'endMin' | 'column' | 'columns'>

/**
 * Where each block of one day too short for a legible title (a 20-minute
 * review is about 9px at the usual hour height) shows its title instead: as a
 * one-line caption just under it, else just over it, wherever neither another
 * block in its lane nor another block's caption is, and inside the grid (a day
 * is 24 hours tall), so captions never cover a block or each other. The block
 * itself stays to scale. Null when the block is tall enough, or both sides
 * are taken (it then squeezes its title inside, as before). Blocks are placed
 * top to bottom, so of two short blocks the earlier one picks first.
 */
export function captionSides(day: ReadonlyArray<Seg>, hourPx: number): Map<string, CaptionSide> {
  const gridBottom = 24 * hourPx
  const topOf = (seg: Seg) => (seg.startMin / 60) * hourPx + 1
  // Boxes (px) taken so far: every block, then each caption as it is placed.
  const taken: { seg: Seg; from: number; to: number }[] = day.map((seg) => ({ seg, from: topOf(seg), to: topOf(seg) + blockHeight(seg, hourPx) }))
  const sides = new Map<string, CaptionSide>()
  for (const seg of [...day].sort((a, b) => a.startMin - b.startMin || a.column - b.column)) {
    const height = blockHeight(seg, hourPx)
    if (height >= COMPACT_BLOCK_PX) {
      sides.set(seg.key, null)
      continue
    }
    const top = topOf(seg)
    const bottom = top + height
    // Free between `from` and `to` (px) in the block's own lane of the day.
    const clear = (from: number, to: number) => taken.every((box) => {
      if (box.seg.key === seg.key) return true
      const other = box.seg
      const sideBySide = (other.column + 1) / other.columns <= seg.column / seg.columns
        || other.column / other.columns >= (seg.column + 1) / seg.columns
      return sideBySide || box.to <= from || box.from >= to
    })
    const below = { from: bottom + 1, to: bottom + 1 + CAPTION_PX }
    const above = { from: top - 1 - CAPTION_PX, to: top - 1 }
    const side: CaptionSide = below.to <= gridBottom && clear(bottom, below.to)
      ? 'below'
      : above.from >= 0 && clear(above.from, top) ? 'above' : null
    sides.set(seg.key, side)
    if (side) taken.push({ seg, ...(side === 'below' ? below : above) })
  }
  return sides
}
