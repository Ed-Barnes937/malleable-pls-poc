import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone'

export interface Context {
  userId: string
}

const USER_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/

export async function createContext({ req, info }: CreateHTTPContextOptions): Promise<Context> {
  const raw = (req.headers['x-user-id'] as string)
    ?? info.connectionParams?.['userId']
    ?? 'anonymous'
  const userId = USER_ID_RE.test(raw) ? raw : 'anonymous'

  return { userId }
}
