/**
 * The confusion automation: "When I mark something confusing, add a 20-min
 * review within 3 days". Shared by the server (which runs and re-places it)
 * and the UI (which renders and edits it as a sentence), so both agree on the
 * params, their defaults and the words used for them.
 */
import { z } from 'zod'

/** Job type that turns a tagged transcript moment into a scheduled review to-do. */
export const REVIEW_TASK_JOB = 'plan:review-task'

/** `plan_items.subtype` of the to-dos this automation creates. */
export const REVIEW_SUBTYPE = 'review'

/**
 * Time zone used for "by tomorrow" / "within N days" day boundaries when the
 * automation has none stored. Users have no time zone preference yet; the
 * sentence editor stores the browser's zone whenever it saves.
 */
export const DEFAULT_REVIEW_TIME_ZONE = 'Europe/London'

export interface ReviewTaskParams {
  /** Length of the review block. */
  durationMin: number
  /**
   * The review must end by the end of the local day this many days after the
   * moment was marked: 1 = "by tomorrow", 3 = "within 3 days".
   */
  windowDays: number
  /** IANA zone the day boundaries are read in. */
  timeZone: string
}

export const DEFAULT_REVIEW_PARAMS: ReviewTaskParams = {
  durationMin: 20,
  windowDays: 3,
  timeZone: DEFAULT_REVIEW_TIME_ZONE,
}

export const REVIEW_DURATION_OPTIONS = [10, 15, 20, 30, 45, 60] as const
export const REVIEW_WINDOW_OPTIONS = [1, 2, 3, 5, 7] as const

/** An IANA time zone name the runtime knows, e.g. "Europe/London". */
export const timeZoneInput = z.string().min(1).max(100).refine((tz) => isValidTimeZone(tz), { message: 'Unknown time zone' })

export const reviewTaskParamsInput = z.object({
  durationMin: z.number().int().min(5).max(240),
  windowDays: z.number().int().min(1).max(14),
  timeZone: timeZoneInput,
})

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone })
    return true
  } catch {
    return false
  }
}

/**
 * Reads stored params (an object, or its JSON text), falling back to the
 * defaults field by field, so an old or hand-edited row (e.g. `{}`) still
 * runs sensibly.
 */
export function parseReviewParams(raw: unknown): ReviewTaskParams {
  const value = asObject(typeof raw === 'string' ? safeJson(raw) : raw)
  const shape = reviewTaskParamsInput.shape
  const pick = <K extends keyof ReviewTaskParams>(key: K): ReviewTaskParams[K] => {
    const parsed = shape[key].safeParse(value[key])
    return (parsed.success ? parsed.data : DEFAULT_REVIEW_PARAMS[key]) as ReviewTaskParams[K]
  }
  return { durationMin: pick('durationMin'), windowDays: pick('windowDays'), timeZone: pick('timeZone') }
}

/** "by tomorrow", "within 3 days", "within a week". */
export function reviewWindowLabel(windowDays: number): string {
  if (windowDays === 1) return 'by tomorrow'
  if (windowDays === 7) return 'within a week'
  return `within ${windowDays} days`
}

/** Tag labels the automation can start from, in the sentence's words. */
export const REVIEW_TRIGGER_LABELS: Record<string, string> = {
  confused: 'confusing',
  'key-point': 'as a key point',
  question: 'as a question',
}
