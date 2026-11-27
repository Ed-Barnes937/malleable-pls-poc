import { NEUTRAL_TONE, type CourseTone } from '@pls/shared-ui'

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

/**
 * The block colours of a course's tone (`useCourseLookup(id)?.tone`); none
 * (no course, or one not loaded yet) gets the neutral shift colours.
 */
export function toneFor(tone: CourseTone | null | undefined): BlockTone {
  return !tone || tone === NEUTRAL_TONE ? NEUTRAL : blockTone(tone, `${tone.tint} ${tone.ink}`)
}

/** Which kind of block a calendar row draws as (see the block language above). */
export type BlockLook = 'class' | 'shift' | 'study'

/** A commitment filed under a course is a class; one under none is a shift (e.g. work). */
export function blockLook(item: { kind: string; course: string | null }): BlockLook {
  if (item.kind !== 'commitment') return 'study'
  return item.course != null ? 'class' : 'shift'
}
