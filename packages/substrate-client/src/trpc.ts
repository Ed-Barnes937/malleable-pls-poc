import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink, splitLink, httpSubscriptionLink } from '@trpc/client'
import superjson from 'superjson'
import type { AppRouter } from '@pls/server'

export const trpc = createTRPCReact<AppRouter>()

const AUTH_TOKEN = (import.meta as any).env?.VITE_AUTH_TOKEN as string | undefined

export function createTRPCClient(url: string, userId: string) {
  const authHeaders: Record<string, string> = AUTH_TOKEN
    ? { Authorization: `Bearer ${AUTH_TOKEN}` }
    : {}

  return trpc.createClient({
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: httpSubscriptionLink({
          url,
          transformer: superjson,
          connectionParams: () => ({ userId, ...authHeaders }),
        }),
        false: httpBatchLink({
          url,
          transformer: superjson,
          headers: () => ({
            'x-user-id': userId,
            ...authHeaders,
          }),
        }),
      }),
    ],
  })
}

export type { AppRouter }
