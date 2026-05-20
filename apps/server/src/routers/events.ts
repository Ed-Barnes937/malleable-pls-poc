import { router, publicProcedure } from '../trpc'
import { EventEmitter, on } from 'events'

export const eventBus = new EventEmitter()
eventBus.setMaxListeners(100)

export interface ServerEvent {
  type: 'job:completed' | 'job:failed' | 'data:changed'
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
