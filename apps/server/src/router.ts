import { router } from './trpc'
import { recordingsRouter } from './routers/recordings'
import { transcriptsRouter } from './routers/transcripts'
import { tagsRouter } from './routers/tags'
import { annotationsRouter } from './routers/annotations'
import { confidenceRouter } from './routers/confidence'
import { linksRouter } from './routers/links'
import { aggregatesRouter } from './routers/aggregates'
import { workspacesRouter } from './routers/workspaces'
import { workflowsRouter } from './routers/workflows'
import { jobsRouter } from './routers/jobs'
import { eventsRouter } from './routers/events'

export const appRouter = router({
  recordings: recordingsRouter,
  transcripts: transcriptsRouter,
  tags: tagsRouter,
  annotations: annotationsRouter,
  confidence: confidenceRouter,
  links: linksRouter,
  aggregates: aggregatesRouter,
  workspaces: workspacesRouter,
  workflows: workflowsRouter,
  jobs: jobsRouter,
  events: eventsRouter,
})

export type AppRouter = typeof appRouter
