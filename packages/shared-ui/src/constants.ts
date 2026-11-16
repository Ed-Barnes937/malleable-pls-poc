import type { CourseColor } from '@pls/substrate'

/**
 * A course's colours as Tailwind classes, backed by the `course-<colour>`
 * design tokens in apps/web/src/index.css (both themes), one set per palette
 * colour (`COURSE_COLORS`). Literal strings so Tailwind picks them up.
 */
export interface CourseTone {
  /** Solid colour: dots, stripes, left bars, markers (`bg-`). */
  stripe: string
  /** Same colour as a border (`border-`). */
  stripeBorder: string
  /** Fuller tint: class blocks, pills (`bg-`). */
  tint: string
  /** Lighter tint: study blocks, due chips (`bg-`). */
  soft: string
  /** Text on the tint, the soft tint or a panel (`text-`). */
  ink: string
  /** Tint as an inset outline (`ring-`), for soft fills that need an edge. */
  ring: string
  /** The solid colour as a CSS value, for effects classes can't name (e.g. `--glow`). */
  solid: string
  /** Diagonal hatching in the soft tint (`hatch-`, see index.css): drafted, unsaved blocks. */
  hatch: string
}

export const COURSE_TONES: Record<CourseColor, CourseTone> = {
  green: {
    stripe: 'bg-course-green',
    stripeBorder: 'border-course-green',
    tint: 'bg-course-green-tint',
    soft: 'bg-course-green-soft',
    ink: 'text-course-green-ink',
    ring: 'ring-course-green-tint',
    solid: 'var(--color-course-green)',
    hatch: 'hatch-course-green-soft',
  },
  blue: {
    stripe: 'bg-course-blue',
    stripeBorder: 'border-course-blue',
    tint: 'bg-course-blue-tint',
    soft: 'bg-course-blue-soft',
    ink: 'text-course-blue-ink',
    ring: 'ring-course-blue-tint',
    solid: 'var(--color-course-blue)',
    hatch: 'hatch-course-blue-soft',
  },
  purple: {
    stripe: 'bg-course-purple',
    stripeBorder: 'border-course-purple',
    tint: 'bg-course-purple-tint',
    soft: 'bg-course-purple-soft',
    ink: 'text-course-purple-ink',
    ring: 'ring-course-purple-tint',
    solid: 'var(--color-course-purple)',
    hatch: 'hatch-course-purple-soft',
  },
  amber: {
    stripe: 'bg-course-amber',
    stripeBorder: 'border-course-amber',
    tint: 'bg-course-amber-tint',
    soft: 'bg-course-amber-soft',
    ink: 'text-course-amber-ink',
    ring: 'ring-course-amber-tint',
    solid: 'var(--color-course-amber)',
    hatch: 'hatch-course-amber-soft',
  },
  rose: {
    stripe: 'bg-course-rose',
    stripeBorder: 'border-course-rose',
    tint: 'bg-course-rose-tint',
    soft: 'bg-course-rose-soft',
    ink: 'text-course-rose-ink',
    ring: 'ring-course-rose-tint',
    solid: 'var(--color-course-rose)',
    hatch: 'hatch-course-rose-soft',
  },
  teal: {
    stripe: 'bg-course-teal',
    stripeBorder: 'border-course-teal',
    tint: 'bg-course-teal-tint',
    soft: 'bg-course-teal-soft',
    ink: 'text-course-teal-ink',
    ring: 'ring-course-teal-tint',
    solid: 'var(--color-course-teal)',
    hatch: 'hatch-course-teal-soft',
  },
  orange: {
    stripe: 'bg-course-orange',
    stripeBorder: 'border-course-orange',
    tint: 'bg-course-orange-tint',
    soft: 'bg-course-orange-soft',
    ink: 'text-course-orange-ink',
    ring: 'ring-course-orange-tint',
    solid: 'var(--color-course-orange)',
    hatch: 'hatch-course-orange-soft',
  },
  slate: {
    stripe: 'bg-course-slate',
    stripeBorder: 'border-course-slate',
    tint: 'bg-course-slate-tint',
    soft: 'bg-course-slate-soft',
    ink: 'text-course-slate-ink',
    ring: 'ring-course-slate-tint',
    solid: 'var(--color-course-slate)',
    hatch: 'hatch-course-slate-soft',
  },
}

/** No course, or one we have no colours for: neutral shift-like greys. */
export const NEUTRAL_TONE: CourseTone = {
  stripe: 'bg-text-muted',
  stripeBorder: 'border-text-muted',
  tint: 'bg-surface-overlay',
  soft: 'bg-surface-inset',
  ink: 'text-text-secondary',
  ring: 'ring-border-subtle',
  solid: 'var(--color-accent)',
  hatch: 'hatch-surface-overlay',
}

/** The tone of a palette colour; neutral for none (no course, or one not loaded). */
export function courseTone(color: CourseColor | null | undefined): CourseTone {
  return (color && COURSE_TONES[color]) || NEUTRAL_TONE
}
