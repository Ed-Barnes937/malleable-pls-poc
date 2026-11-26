/**
 * Saves per key (a block), one at a time, latest wins: while a save for a
 * key is in flight, further changes replace the one waiting, and only the
 * last is sent next. Quick arrow presses on a block then end with the server
 * on the last position, not whichever save it happened to apply last.
 */
export interface SaveQueue<T> {
  push(key: string, value: T): void
  /** A save for this key is in flight or waiting. */
  busy(key: string): boolean
}

export interface SaveQueueOptions<T> {
  /** The key has nothing left to send: how its last save went. */
  onDone?: (key: string, result: { value: T; error?: unknown }) => void
}

export function createSaveQueue<T>(send: (key: string, value: T) => Promise<unknown>, options: SaveQueueOptions<T> = {}): SaveQueue<T> {
  const inFlight = new Set<string>()
  const waiting = new Map<string, T>()

  const run = (key: string, value: T) => {
    inFlight.add(key)
    const settle = (error?: unknown) => {
      const next = waiting.get(key)
      if (waiting.delete(key)) return run(key, next as T)
      inFlight.delete(key)
      options.onDone?.(key, error === undefined ? { value } : { value, error })
    }
    send(key, value).then(() => settle(), (error: unknown) => settle(error ?? new Error('Save failed')))
  }

  return {
    push(key, value) {
      if (inFlight.has(key)) waiting.set(key, value)
      else run(key, value)
    },
    busy: (key) => inFlight.has(key),
  }
}
