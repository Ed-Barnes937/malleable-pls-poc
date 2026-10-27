// How a student stands with one lecture moment, from what they told us: the
// latest "how sure you feel" rating and whether they marked it confusing.
// One rule behind every count and list (Your progress, All courses, Weak
// topics), so the widgets always agree. The SQL in
// apps/server/src/routers/aggregates.ts mirrors it.

/** Felt less sure than this (percent): the moment needs another look. */
export const WEAK_BELOW = 50
/** Felt at least this sure (percent): the moment is solid. */
export const SOLID_FROM = 70

export interface MomentSignals {
  /** The latest rating (0-100), or null if never rated. */
  latestScore: number | null
  /** When the latest rating was given (ISO or ms), or null. */
  latestAt: string | number | null
  /** When it was last marked confusing (ISO or ms), or null if never. */
  confusedAt: string | number | null
}

/**
 * - `review`: marked confusing and not felt sure about since, or the latest
 *   rating is under WEAK_BELOW.
 * - `solid`: the latest rating is SOLID_FROM or more (and was given after any
 *   confusing mark).
 * - `learning`: everything else (never rated, or in between).
 */
export type MomentStatus = 'review' | 'solid' | 'learning'

export function momentStatus(signals: MomentSignals): MomentStatus {
  const { latestScore } = signals
  if ((latestScore != null && latestScore < WEAK_BELOW) || stillConfused(signals)) return 'review'
  if (latestScore != null && latestScore >= SOLID_FROM) return 'solid'
  return 'learning'
}

/** Marked confusing, and not felt sure about (SOLID_FROM or more) since. */
export function stillConfused({ latestScore, latestAt, confusedAt }: MomentSignals): boolean {
  if (confusedAt == null) return false
  const sureSince = latestScore != null && latestScore >= SOLID_FROM && latestAt != null && toMs(latestAt) > toMs(confusedAt)
  return !sureSince
}

function toMs(t: string | number): number {
  return typeof t === 'number' ? t : Date.parse(t)
}
