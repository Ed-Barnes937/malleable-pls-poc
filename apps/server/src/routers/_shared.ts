import { z } from 'zod'

/** Scope filter shared by the list endpoints that can narrow to a single recording. */
export const recordingScope = z.object({
  recordingId: z.string().max(255).optional(),
})
