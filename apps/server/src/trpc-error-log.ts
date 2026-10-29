import type { TRPCError } from '@trpc/server'

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * One log line for a failed tRPC call: the procedure, the tRPC code and the
 * cause's code and message (e.g. a Postgres error's SQLSTATE and message).
 * Never the input or the rest of the cause: a Postgres error's `detail` and
 * `where` can quote values the student typed.
 */
export function trpcErrorLine(type: string, path: string | undefined, error: TRPCError): string {
  const cause = error.cause as { code?: unknown; message?: unknown } | undefined
  const causeCode = typeof cause?.code === 'string' || typeof cause?.code === 'number' ? ` [${cause.code}]` : ''
  const message = typeof cause?.message === 'string' ? cause.message : error.message
  return `tRPC ${type} ${path ?? '<unknown>'} failed: ${error.code}${causeCode} ${oneLine(message)}`
}
