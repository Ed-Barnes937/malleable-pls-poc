import { z } from 'zod'
import { boardIdInput, planItemIdInput } from './plan-item-schemas'
import { timeZoneInput } from './workflows/review-automation'
import type { RefitProposal } from './planning'

/** `planItems.refitPreview`: the zone the student's study day is read in. */
export const refitPreviewInput = z.object({ timeZone: timeZoneInput })

/** The blocks that didn't happen and where re-fit would put them (empty when none were missed). */
export type RefitPreview = RefitProposal[]

const isoInstant = z.string().max(64).refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

/** `planItems.refit`: accept the previewed blocks (all of them, or the ones the student kept). */
export const refitAcceptInput = z.object({
  timeZone: timeZoneInput,
  blocks: z.array(z.object({
    id: planItemIdInput,
    starts_at: isoInstant,
    ends_at: isoInstant,
  })).min(1).max(50),
  workspaceId: boardIdInput,
})

export type RefitAccept = z.input<typeof refitAcceptInput>

export interface RefitResult {
  /** To-dos now at their new time. */
  moved: number
}
