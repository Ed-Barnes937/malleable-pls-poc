/**
 * Block colours per course. Literal class strings so Tailwind picks them up.
 * Commitments get a fuller tint; study time a lighter one with a dashed
 * outline, so "fixed" and "movable" read apart at a glance.
 */
export interface BlockTone {
  /** Left accent bar and dot. */
  bar: string
  commitment: string
  study: string
  /** Due chip in the all-day row and marker line in the grid. */
  due: string
  marker: string
}

const TONES: Record<string, BlockTone> = {
  biology: {
    bar: 'bg-emerald-500',
    commitment: 'bg-emerald-500/20 group-hover:bg-emerald-500/25',
    study: 'bg-emerald-500/8 group-hover:bg-emerald-500/14 border border-dashed border-emerald-500/45',
    due: 'bg-emerald-500/12 text-text-primary ring-1 ring-emerald-500/30',
    marker: 'bg-emerald-500',
  },
  chemistry: {
    bar: 'bg-accent',
    commitment: 'bg-accent/20 group-hover:bg-accent/25',
    study: 'bg-accent/8 group-hover:bg-accent/14 border border-dashed border-accent/45',
    due: 'bg-accent/12 text-text-primary ring-1 ring-accent/30',
    marker: 'bg-accent',
  },
  physics: {
    bar: 'bg-tag-key-point',
    commitment: 'bg-tag-key-point/20 group-hover:bg-tag-key-point/25',
    study: 'bg-tag-key-point/8 group-hover:bg-tag-key-point/14 border border-dashed border-tag-key-point/45',
    due: 'bg-tag-key-point/12 text-text-primary ring-1 ring-tag-key-point/30',
    marker: 'bg-tag-key-point',
  },
}

const NEUTRAL: BlockTone = {
  bar: 'bg-neutral-500',
  commitment: 'bg-neutral-500/18 group-hover:bg-neutral-500/24',
  study: 'bg-neutral-500/8 group-hover:bg-neutral-500/14 border border-dashed border-neutral-500/45',
  due: 'bg-neutral-500/12 text-text-primary ring-1 ring-neutral-500/30',
  marker: 'bg-neutral-500',
}

export function toneFor(course: string | null): BlockTone {
  return (course && TONES[course]) || NEUTRAL
}
