import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone'
import type { AiDeps } from './ai/deps'

export interface Context {
  userId: string
  /** AI capabilities for routers; see ./ai/deps.ts. */
  ai: AiDeps
}

const USER_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/

export function createContextFactory(ai: AiDeps) {
  return async function createContext({ req, info }: CreateHTTPContextOptions): Promise<Context> {
    const raw = (req.headers['x-user-id'] as string)
      ?? info.connectionParams?.['userId']
      ?? 'anonymous'
    const userId = USER_ID_RE.test(raw) ? raw : 'anonymous'

    return { userId, ai }
  }
}
