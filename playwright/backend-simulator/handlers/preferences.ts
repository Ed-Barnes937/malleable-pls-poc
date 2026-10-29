import { parsePlanItemInput as parse, preferencesUpdateInput, withDefaults } from '@pls/substrate'
import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'

/**
 * Mirrors apps/server/src/routers/preferences.ts for the simulator's one
 * user: the same input schema, absent fields unchanged, `null` back to the
 * default, and reads with defaults filled in.
 */
export function registerPreferencesHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('preferences.get', () => withDefaults(db.preferences))

  router.register('preferences.update', (input) => {
    const patch = parse(preferencesUpdateInput, input)
    const stored = { time_zone: null, study_hours: null, study_min_per_day: null, ...db.preferences }
    for (const key of ['time_zone', 'study_hours', 'study_min_per_day'] as const) {
      if (patch[key] !== undefined) Object.assign(stored, { [key]: patch[key] })
    }
    db.preferences = stored
    return withDefaults(db.preferences)
  })
}
