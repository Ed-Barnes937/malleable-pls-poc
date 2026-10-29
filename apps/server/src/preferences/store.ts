import type { JSONValue, TransactionSql } from 'postgres'
import { withDefaults, type PreferencesUpdate, type StudyHours, type UserPreferences } from '@pls/substrate'

// The student's study rhythm (`user_preferences`): read by the preferences
// router and by every server-side placement (Auto-fill, re-fit, the
// confusion automation), so they all use the same study hours and budget.
// No row, or a NULL column, means the default.

/** The user's preferences with defaults filled in. Call inside `withUser`. */
export async function getPreferences(tx: TransactionSql, userId: string): Promise<UserPreferences> {
  const [row] = await tx`
    SELECT time_zone, study_hours, study_min_per_day FROM user_preferences
    WHERE user_id = ${userId}
  `
  if (!row) return withDefaults(null)
  return withDefaults({
    time_zone: (row.time_zone as string | null) ?? null,
    study_hours: (row.study_hours as StudyHours | null) ?? null,
    study_min_per_day: (row.study_min_per_day as number | null) ?? null,
  })
}

/**
 * Applies `patch` (absent fields unchanged, `null` back to the default) and
 * returns the result with defaults filled in. Input is already validated by
 * `preferencesUpdateInput`; the table's CHECKs are the last line.
 */
export async function updatePreferences(
  tx: TransactionSql,
  userId: string,
  patch: PreferencesUpdate,
): Promise<UserPreferences> {
  const has = {
    time_zone: patch.time_zone !== undefined,
    study_hours: patch.study_hours !== undefined,
    study_min_per_day: patch.study_min_per_day !== undefined,
  }
  if (has.time_zone || has.study_hours || has.study_min_per_day) {
    // A new row takes what was given (the rest NULL, i.e. default); an
    // existing row keeps every column the patch leaves out.
    await tx`
      INSERT INTO user_preferences (user_id, time_zone, study_hours, study_min_per_day)
      VALUES (
        ${userId},
        ${patch.time_zone ?? null},
        ${patch.study_hours ? tx.json(patch.study_hours as unknown as JSONValue) : null},
        ${patch.study_min_per_day ?? null}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        time_zone = CASE WHEN ${has.time_zone} THEN EXCLUDED.time_zone ELSE user_preferences.time_zone END,
        study_hours = CASE WHEN ${has.study_hours} THEN EXCLUDED.study_hours ELSE user_preferences.study_hours END,
        study_min_per_day = CASE WHEN ${has.study_min_per_day} THEN EXCLUDED.study_min_per_day ELSE user_preferences.study_min_per_day END,
        updated_at = now()
    `
  }
  return getPreferences(tx, userId)
}

/** The zone automatic placement reads study hours in: the preference, else the caller's own. */
export function placementTimeZone(prefs: UserPreferences, fallback: string): string {
  return prefs.time_zone ?? fallback
}
