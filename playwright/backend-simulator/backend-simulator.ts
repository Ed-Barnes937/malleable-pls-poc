import type { Page, Route } from '@playwright/test'
import { ProcedureRouter, handleTrpcRequest } from './trpc-protocol'
import { EndpointBehaviour, EndpointBehaviourManager } from './endpoint-behaviour'
import { InMemoryDb, type SeedData } from './in-memory-db'
import { createDefaultSeedData } from './seed-data'
import { registerWorkspacesHandlers } from './handlers/workspaces'
import { registerRecordingsHandlers } from './handlers/recordings'
import { registerTranscriptsHandlers } from './handlers/transcripts'
import { registerTagsHandlers } from './handlers/tags'
import { registerJobsHandlers } from './handlers/jobs'
import { registerAnnotationsHandlers } from './handlers/annotations'
import { registerConfidenceHandlers } from './handlers/confidence'
import { registerLinksHandlers } from './handlers/links'
import { registerAggregatesHandlers } from './handlers/aggregates'
import { registerWorkflowsHandlers } from './handlers/workflows'

export const TRPC_URL = 'http://localhost:3999/trpc'

export class BackendSimulator {
  readonly db: InMemoryDb
  readonly behaviours: EndpointBehaviourManager
  private router: ProcedureRouter
  private sseClients: Array<{ resolve: (value: string) => void }> = []

  constructor(seed?: SeedData) {
    this.db = new InMemoryDb(seed ?? createDefaultSeedData())
    this.behaviours = new EndpointBehaviourManager()
    this.router = new ProcedureRouter()
    this.registerAllHandlers()
  }

  private registerAllHandlers(): void {
    registerWorkspacesHandlers(this.router, this.db)
    registerRecordingsHandlers(this.router, this.db)
    registerTranscriptsHandlers(this.router, this.db)
    registerTagsHandlers(this.router, this.db)
    registerJobsHandlers(this.router, this.db)
    registerAnnotationsHandlers(this.router, this.db)
    registerConfidenceHandlers(this.router, this.db)
    registerLinksHandlers(this.router, this.db)
    registerAggregatesHandlers(this.router, this.db)
    registerWorkflowsHandlers(this.router, this.db)
  }

  async handleNetworking(page: Page): Promise<void> {
    await page.route(`${TRPC_URL}/**`, (route) => this.handleRoute(route))
  }

  private async handleRoute(route: Route): Promise<void> {
    const request = route.request()
    const url = request.url()
    const method = request.method()

    if (request.headers()['accept']?.includes('text/event-stream')) {
      await this.handleSSE(route)
      return
    }

    let postBody: string | undefined
    if (method === 'POST') {
      postBody = request.postData() ?? undefined
    }

    const result = await handleTrpcRequest(
      url,
      method,
      postBody,
      this.router,
      this.behaviours,
    )

    if (result.abort) {
      await route.abort('failed')
      return
    }

    if (result.stall) {
      // Never respond — simulates a hanging request
      return
    }

    await route.fulfill({
      status: result.status,
      contentType: result.contentType,
      body: result.body,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
      },
    })
  }

  private async handleSSE(route: Route): Promise<void> {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
        'access-control-allow-origin': '*',
      },
      body: '',
    })
  }

  setBehaviour(procedurePath: string, behaviour: EndpointBehaviour): void {
    this.behaviours.set(procedurePath, behaviour)
  }

  resetBehaviour(procedurePath?: string): void {
    if (procedurePath) {
      this.behaviours.reset(procedurePath)
    } else {
      this.behaviours.resetAll()
    }
  }

  resetData(seed?: SeedData): void {
    this.db.reset(seed ?? createDefaultSeedData())
  }
}
