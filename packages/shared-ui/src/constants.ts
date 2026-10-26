/** Courses a student can file recordings under (stored as a 'recording' tag label). */
export const COURSES = [
  { value: 'biology', label: 'Biology' },
  { value: 'chemistry', label: 'Chemistry' },
  { value: 'physics', label: 'Physics' },
] as const

export const COURSE_COLORS: Record<string, string> = {
  biology: 'bg-emerald-500',
  chemistry: 'bg-accent',
  physics: 'bg-tag-key-point',
}

export const COURSE_PILL_COLORS: Record<string, string> = {
  biology: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20',
  chemistry: 'bg-accent/15 text-accent ring-accent/20',
  physics: 'bg-tag-key-point/15 text-tag-key-point ring-tag-key-point/20',
}
