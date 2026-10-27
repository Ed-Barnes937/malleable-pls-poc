import { router, publicProcedure } from '../trpc'
import { EventEmitter, on } from 'events'

// In-process event bus: events emitted on one server instance are only seen by
// subscribers connected to that same instance. Replace with a shared pub/sub
// (e.g. Redis) before scaling horizontally.
export const eventBus = new EventEmitter()
eventBus.setMaxListeners(100)

export interface ServerEvent {
  type: 'job:started' | 'job:completed' | 'job:failed' | 'data:changed'
  table?: string
  jobType?: string
  /** job:failed only - true when the runner will retry automatically. */
  willRetry?: boolean
  /** job:completed only - the run changed nothing worth telling the student (e.g. a duplicate mark). */
  quiet?: boolean
  /** job:completed only - the time block the run placed (e.g. a new review), so the UI can offer "See it". */
  planItem?: { id: string; startsAt: string }
  /** job:completed only - the run made a to-do but found no time for it. */
  unplaced?: true
  userId: string
}

export function emitEvent(event: ServerEvent) {
  eventBus.emit('event', event)
}

export const eventsRouter = router({
  onDataChange: publicProcedure
    .subscription(async function* ({ ctx, signal }) {
      for await (const [event] of on(eventBus, 'event', { signal })) {
        const serverEvent = event as ServerEvent
        if (serverEvent.userId === ctx.userId) {
          yield serverEvent
        }
      }
    }),
})
