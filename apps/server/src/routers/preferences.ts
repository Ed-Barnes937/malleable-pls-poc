import { withUser } from '@pls/db'
import { preferencesUpdateInput, type UserPreferences } from '@pls/substrate'
import { router, publicProcedure } from '../trpc'
import { getPreferences, updatePreferences } from '../preferences/store'

/**
 * The student's study rhythm: study hours per weekday, study time per day
 * and time zone, with defaults filled in. One per user, read by every
 * Calendar and by the server's automatic placement. No event is dispatched
 * on update: nothing reacts to it yet (placed blocks stay where they are).
 */
export const preferencesRouter = router({
  get: publicProcedure.query(({ ctx }): Promise<UserPreferences> =>
    withUser(ctx.userId, (tx) => getPreferences(tx, ctx.userId)),
  ),

  update: publicProcedure
    .input(preferencesUpdateInput)
    .mutation(({ ctx, input }): Promise<UserPreferences> =>
      withUser(ctx.userId, (tx) => updatePreferences(tx, ctx.userId, input)),
    ),
})
