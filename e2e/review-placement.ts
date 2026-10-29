import type { APIRequestContext } from '@playwright/test'
import { startOfLocalDay } from '../packages/scheduler/src'
import { placeReviews, type PlanItemOccurrence, type UserPreferences } from '../packages/substrate/src'
import { trpcQuery } from './api'

/**
 * Where the confusion automation should have put a new review, from the
 * calendar as the API shows it now: the earliest free time in its window,
 * an hour after the mark, inside the student's study hours (their
 * preference, as the API shows it), around every commitment and block, on a
 * day with study time left (`placeReviews`, which the server uses).
 *
 * The server read its own clock when the job ran, somewhere between
 * `marked.from` and `marked.to` (either side of the click), so this answers
 * the placement for both ends. A placement equal to either is right.
 */
export async function expectedReviewSlots(
  request: APIRequestContext,
  /** `markedAt` when re-placing (the review's `created_at`); a new review is marked at the server's clock. */
  review: { id: string; durationMin: number; latest: number; markedAt?: number },
  marked: { from: number; to: number },
  automationTimeZone: string,
): Promise<Array<{ start: number; end: number } | null>> {
  const prefs = await trpcQuery<UserPreferences>(request, 'preferences.get')
  const timeZone = prefs.time_zone ?? automationTimeZone
  const placement = { timeZone, studyHours: prefs.study_hours, studyMinPerDay: prefs.study_min_per_day }
  const range = { start: startOfLocalDay(marked.from, timeZone), end: review.latest }
  const items = await trpcQuery<PlanItemOccurrence[]>(request, 'planItems.list', {
    from: new Date(range.start).toISOString(),
    to: new Date(range.end).toISOString(),
    statuses: ['open', 'done'],
  })
  return [marked.from, marked.to].map((now) => {
    const slot = placeReviews(items, [{ ...review, markedAt: review.markedAt ?? now }], range, { now, ...placement }).get(review.id)
    return slot && 'start' in slot ? slot : null
  })
}
