import { router } from './trpc'
import { recordingsRouter } from './routers/recordings'
import { lecturesRouter } from './routers/lectures'
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
import { planItemsRouter } from './routers/plan-items'
import { planningRouter } from './routers/planning'
import { preferencesRouter } from './routers/preferences'
import { resourcesRouter } from './routers/resources'

export const appRouter = router({
  lectures: lecturesRouter,
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
  planItems: planItemsRouter,
  planning: planningRouter,
  preferences: preferencesRouter,
  resources: resourcesRouter,
})

export type AppRouter = typeof appRouter
