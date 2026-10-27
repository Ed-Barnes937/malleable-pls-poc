import { NEUTRAL_TONE, courseTone, type CourseTone } from '@pls/shared-ui'

/**
 * Block colours per course, from the course tokens (see COURSE_TONES in
 * @pls/shared-ui). The block language: a class is the solid course tint;
 * study time the soft tint with a tint edge and a solid left bar; a drafted
 * block is hatched with a dashed edge. So "fixed", "movable" and "not saved
 * yet" read apart at a glance. A commitment with no course (a work shift)
 * gets the soft neutral shift colours.
 */
export interface BlockTone {
  /** Solid colour: dots, the study block's left bar, due marker lines. */
  bar: string
  /** Fixed block (a class or a shift): fill, text and any edge. */
  commitment: string
  /** Movable study block: soft fill, text and a tint edge. */
  study: string
  /** Due chip in the all-day row. */
  due: string
  /** Drafted, unsaved block: hatched in the soft tint, text and a dashed solid-colour edge. */
  ghost: string
}

function blockTone(t: CourseTone, commitment: string): BlockTone {
  const soft = `${t.soft} ${t.ink} ring-1 ring-inset ${t.ring}`
  return {
    bar: t.stripe,
    commitment,
    study: soft,
    due: soft,
    ghost: `bg-surface-raised ${t.hatch} ${t.ink} border-[1.5px] border-dashed ${t.stripeBorder}`,
  }
}

const SHIFT = 'bg-shift text-shift-ink ring-1 ring-inset ring-shift-line'
const NEUTRAL = blockTone(NEUTRAL_TONE, SHIFT)

export function toneFor(course: string | null): BlockTone {
  const t = courseTone(course)
  return t === NEUTRAL_TONE ? NEUTRAL : blockTone(t, `${t.tint} ${t.ink}`)
}

/** Which kind of block a calendar row draws as (see the block language above). */
export type BlockLook = 'class' | 'shift' | 'study'

export function blockLook(item: { kind: string; course: string | null }): BlockLook {
  if (item.kind !== 'commitment') return 'study'
  return courseTone(item.course) === NEUTRAL_TONE ? 'shift' : 'class'
}
