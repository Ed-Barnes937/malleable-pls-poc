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
