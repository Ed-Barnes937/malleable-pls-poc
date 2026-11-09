// How the server's job runner schedules attempts. No imports, so e2e/reseed.ts
// can derive how long a run may take to settle from the same numbers.

/**
 * Automatic retries after a failed attempt; a run that exhausts them can be
 * retried by hand. Executors that call a paid AI provider opt out via
 * `ExecutorMeta.maxRetries: 0` (see executors.ts).
 */
export const MAX_RETRIES = 3

/** How often the runner claims due runs. */
export const POLL_INTERVAL_MS = 2000

/** How long a retry waits before it is due: 2^retryCount seconds, capped at a minute. */
export function retryBackoffMs(retryCount: number): number {
  return Math.min(2 ** retryCount * 1000, 60_000)
}
