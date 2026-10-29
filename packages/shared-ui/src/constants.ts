/** Courses a student can file recordings under (stored as a 'recording' tag label). */
export const COURSES = [
  { value: 'biology', label: 'Biology' },
  { value: 'chemistry', label: 'Chemistry' },
  { value: 'physics', label: 'Physics' },
] as const

/**
 * A course's colours as Tailwind classes, backed by the `course-*` design
 * tokens in apps/web/src/index.css (both themes). Literal strings so Tailwind
 * picks them up.
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

export const COURSE_TONES: Record<string, CourseTone> = {
  biology: {
    stripe: 'bg-course-biology',
    stripeBorder: 'border-course-biology',
    tint: 'bg-course-biology-tint',
    soft: 'bg-course-biology-soft',
    ink: 'text-course-biology-ink',
    ring: 'ring-course-biology-tint',
    solid: 'var(--color-course-biology)',
    hatch: 'hatch-course-biology-soft',
  },
  chemistry: {
    stripe: 'bg-course-chemistry',
    stripeBorder: 'border-course-chemistry',
    tint: 'bg-course-chemistry-tint',
    soft: 'bg-course-chemistry-soft',
    ink: 'text-course-chemistry-ink',
    ring: 'ring-course-chemistry-tint',
    solid: 'var(--color-course-chemistry)',
    hatch: 'hatch-course-chemistry-soft',
  },
  physics: {
    stripe: 'bg-course-physics',
    stripeBorder: 'border-course-physics',
    tint: 'bg-course-physics-tint',
    soft: 'bg-course-physics-soft',
    ink: 'text-course-physics-ink',
    ring: 'ring-course-physics-tint',
    solid: 'var(--color-course-physics)',
    hatch: 'hatch-course-physics-soft',
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

export function courseTone(course: string | null | undefined): CourseTone {
  return (course && COURSE_TONES[course]) || NEUTRAL_TONE
}

/** Solid course colour (dots, bars). */
export const COURSE_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(COURSE_TONES).map(([course, t]) => [course, t.stripe]),
)

/** Course pill: tint behind ink. */
export const COURSE_PILL_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(COURSE_TONES).map(([course, t]) => [course, `${t.tint} ${t.ink} ${t.ring}`]),
)
