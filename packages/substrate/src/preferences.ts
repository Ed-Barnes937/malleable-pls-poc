/**
 * The student's study rhythm: one per-user preference that every Calendar,
 * Help me plan, Auto-fill, re-fit and the confusion automation read, so they
 * all agree (decision 25). Stored in `user_preferences`; a column left NULL
 * means "use the default".
 *
 * - Study hours: when the student is willing to study, one window per
 *   weekday (null = no study that day). Hard for automatic placement,
 *   ignored for manual drag and create.
 * - Study time per day: the daily budget automatic placement fills to.
 * - Time zone: the IANA zone those hours are read in.
 */
import { z } from 'zod'
import type { DayWindow } from '@pls/scheduler'
import { timeZoneInput } from './workflows/review-automation'

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Weekday = (typeof WEEKDAYS)[number]

/** One day's study window, local `"HH:MM"`, ending after it starts on the same day (`end` may be `"24:00"`). */
export interface StudyWindow {
  start: string
  end: string
}

/** Study hours per weekday; `null` means no study that day. */
export type StudyHours = Record<Weekday, StudyWindow | null>

/** Default study hours: 09:00-22:00 every day. */
export const DEFAULT_STUDY_HOURS: StudyHours = Object.freeze(
  Object.fromEntries(WEEKDAYS.map((d) => [d, Object.freeze({ start: '09:00', end: '22:00' })])) as StudyHours,
)

/**
 * Default "study time per day": the most automatic placement fills into one
 * day, counting study blocks already there (1h to 6h in the picker), so a
 * plan is one a student would follow, not every free minute of study hours.
 */
export const DEFAULT_STUDY_MIN_PER_DAY = 120
export const STUDY_PER_DAY_OPTIONS = [60, 90, 120, 180, 240, 300, 360] as const
export const MIN_STUDY_MIN_PER_DAY = 15
export const MAX_STUDY_MIN_PER_DAY = 14 * 60

/** The preference as every reader sees it: defaults filled in. */
export interface UserPreferences {
  /** IANA zone, or null when not set (callers use their own: the browser's, or the automation's). */
  time_zone: string | null
  study_hours: StudyHours
  study_min_per_day: number
}

/** The stored row's preference columns: null = use the default. */
export interface StoredPreferences {
  time_zone: string | null
  study_hours: StudyHours | null
  study_min_per_day: number | null
}

export const DEFAULT_PREFERENCES: UserPreferences = Object.freeze({
  time_zone: null,
  study_hours: DEFAULT_STUDY_HOURS,
  study_min_per_day: DEFAULT_STUDY_MIN_PER_DAY,
})

/** Fills the defaults in for anything not set (or no row at all). */
export function withDefaults(stored: Partial<StoredPreferences> | null | undefined): UserPreferences {
  return {
    time_zone: stored?.time_zone ?? null,
    study_hours: stored?.study_hours ?? DEFAULT_STUDY_HOURS,
    study_min_per_day: stored?.study_min_per_day ?? DEFAULT_STUDY_MIN_PER_DAY,
  }
}

const startOfWindow = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Expected HH:MM' })
const endOfWindow = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, { message: 'Expected HH:MM or 24:00' })

export const studyWindowSchema = z
  .object({ start: startOfWindow, end: endOfWindow })
  .strict()
  // Zero-padded HH:MM compares as text. No overnight windows for now.
  .refine((w) => w.end > w.start, { message: 'Study hours must end after they start' })

export const studyHoursSchema = z
  .object(Object.fromEntries(WEEKDAYS.map((d) => [d, studyWindowSchema.nullable()])) as Record<Weekday, z.ZodNullable<typeof studyWindowSchema>>)
  .strict()

/**
 * `preferences.update`: each field left out is unchanged; `null` resets it
 * to the default.
 */
export const preferencesUpdateInput = z
  .object({
    time_zone: timeZoneInput.nullable().optional(),
    study_hours: studyHoursSchema.nullable().optional(),
    study_min_per_day: z.number().int().min(MIN_STUDY_MIN_PER_DAY).max(MAX_STUDY_MIN_PER_DAY).nullable().optional(),
  })
  .strict()

export type PreferencesUpdate = z.input<typeof preferencesUpdateInput>

/**
 * Study hours as the scheduler's per-weekday windows (`FreeSlotPrefs.days`,
 * Monday first).
 */
export function studyDayWindows(hours: StudyHours): Array<DayWindow | null> {
  return WEEKDAYS.map((d) => {
    const w = hours[d]
    return w ? { dayStart: w.start, dayEnd: w.end } : null
  })
}

/**
 * The preference after `patch`, as `preferences.update` saves it: a field
 * left out is unchanged, `null` puts the default back. Shows a change
 * straight away, before the server has it.
 */
export function applyPreferencesUpdate(prefs: UserPreferences, patch: PreferencesUpdate): UserPreferences {
  return {
    time_zone: patch.time_zone === undefined ? prefs.time_zone : patch.time_zone,
    study_hours: patch.study_hours === undefined ? prefs.study_hours : (patch.study_hours ?? DEFAULT_STUDY_HOURS),
    study_min_per_day: patch.study_min_per_day === undefined ? prefs.study_min_per_day : (patch.study_min_per_day ?? DEFAULT_STUDY_MIN_PER_DAY),
  }
}

/** Whether two study windows (or "no study" days) are the same. */
export function sameStudyWindow(a: StudyWindow | null, b: StudyWindow | null): boolean {
  return a === b || (!!a && !!b && a.start === b.start && a.end === b.end)
}

/** Whether two weeks of study hours are the same, day by day. */
export function sameStudyHours(a: StudyHours, b: StudyHours): boolean {
  return WEEKDAYS.every((d) => sameStudyWindow(a[d], b[d]))
}

const WEEKDAY_LABELS: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }

/** "Mon", "Tue", ... for a weekday. */
export function weekdayLabel(day: Weekday): string {
  return WEEKDAY_LABELS[day]
}

/**
 * Study hours in a few words, for the Help me plan line:
 * "Study 09:00-22:00" (every day the same), "Study 10:00-22:00, no study Sun"
 * (one range, a few days off), "Study 10:00-22:00 on Mon, Wed" (one range,
 * most days off), "Study hours vary by day", or "No study on any day".
 */
export function studyHoursSummary(hours: StudyHours): string {
  return studyHoursSummaryParts(hours).join(' ')
}

/**
 * `studyHoursSummary` in the phrases a line may wrap between (joined with
 * a space), so it never breaks inside one: ["Study 10:00-22:00,", "no study Sun"].
 */
export function studyHoursSummaryParts(hours: StudyHours): string[] {
  const studying = WEEKDAYS.filter((d) => hours[d])
  if (studying.length === 0) return ['No study on any day']
  const first = hours[studying[0]]!
  if (!studying.every((d) => sameStudyWindow(hours[d], first))) return ['Study hours vary by day']
  const range = `Study ${first.start}-${first.end}`
  if (studying.length === WEEKDAYS.length) return [range]
  if (studying.length <= 3) return [range, `on ${studying.map(weekdayLabel).join(', ')}`]
  return [`${range},`, `no study ${WEEKDAYS.filter((d) => !hours[d]).map(weekdayLabel).join(', ')}`]
}
