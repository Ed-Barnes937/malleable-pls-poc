import { useCallback, useMemo } from 'react'
import { occurrenceDate, type Lecture, type PlanItemOccurrence } from '@pls/substrate'
import { useSubstrate } from './substrate-context'

/**
 * Whether a plan item belongs to a lecture: made from a moment of one of its
 * recordings (`source_type = 'recording'`), or the class occurrence the
 * lecture is (its `class_item_id` on its `class_date`). The occurrence's date
 * is read in the series' zone, else in `timeZone`: the student's placement
 * zone (their preference, else the browser's), as the server reads it.
 */
export function isLinkedToLecture(
  item: Pick<PlanItemOccurrence, 'id' | 'source_type' | 'source_id' | 'starts_at' | 'recurrence'>,
  lecture: Pick<Lecture, 'recordings' | 'class_item_id' | 'class_date'> | null | undefined,
  timeZone: string,
): boolean {
  if (!lecture) return false
  if (item.source_type === 'recording' && lecture.recordings.some((r) => r.id === item.source_id)) return true
  if (!lecture.class_item_id || item.id !== lecture.class_item_id) return false
  return occurrenceDate(item, timeZone) === lecture.class_date
}

/**
 * For widgets that highlight the board's lecture (`lectureId: 'highlight'`):
 * a test for "this item belongs to it", false for everything while no lecture
 * is selected (or it is still loading).
 */
export function useLinkedToLecture(
  lectureId: string | undefined,
): (item: Pick<PlanItemOccurrence, 'id' | 'source_type' | 'source_id' | 'starts_at' | 'recurrence'>) => boolean {
  const substrate = useSubstrate()
  const { data: lecture } = substrate.useLecture(lectureId)
  const { data: prefs } = substrate.usePreferences()
  const browserZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const timeZone = prefs?.time_zone ?? browserZone
  return useCallback(
    (item) => isLinkedToLecture(item, lectureId ? lecture : null, timeZone),
    [lectureId, lecture, timeZone],
  )
}
