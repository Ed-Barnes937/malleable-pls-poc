import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink, splitLink, httpSubscriptionLink } from '@trpc/client'
import superjson from 'superjson'
import type { AppRouter } from '@pls/server'

export const trpc = createTRPCReact<AppRouter>()

export function createTRPCClient(url: string, userId: string) {
  return trpc.createClient({
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: httpSubscriptionLink({
          url,
          transformer: superjson,
          connectionParams: () => ({ userId }),
        }),
        false: httpBatchLink({
          url,
          transformer: superjson,
          headers: () => ({
            'x-user-id': userId,
          }),
        }),
      }),
    ],
  })
}

export type { AppRouter }
