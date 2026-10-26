import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone'
import type { ExecutorRegistry } from '@pls/workflows'
import type { AiDeps } from './ai/deps'

export interface Context {
  userId: string
  /** AI capabilities for routers; see ./ai/deps.ts. */
  ai: AiDeps
  /** The job executors, e.g. for per-job-type retry limits. */
  executors: ExecutorRegistry
}

const USER_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/

export function createContextFactory({ ai, executors }: Pick<Context, 'ai' | 'executors'>) {
  return async function createContext({ req, info }: CreateHTTPContextOptions): Promise<Context> {
    const raw = (req.headers['x-user-id'] as string)
      ?? info.connectionParams?.['userId']
      ?? 'anonymous'
    const userId = USER_ID_RE.test(raw) ? raw : 'anonymous'

    return { userId, ai, executors }
  }
}
