import { expect, type BrowserContext, type Request } from '@playwright/test'
import { apiUrl } from './ports'

/** The live-update stream (events.onDataChange): open for the page's whole life, so never "in flight". */
const isSubscription = (request: Request) => new URL(request.url()).pathname.endsWith('/events.onDataChange')

/**
 * Tracks a browser context's requests to the API, so a test's teardown can
 * let the server finish what the pages asked of it before the next test
 * reseeds. A save still running holds the student's rows in its own lock
 * order (resources.update: the resource, then its lecture), and no one order
 * of reseed's deletes stays clear of every such path.
 */
export function watchApiRequests(context: BrowserContext) {
  const inFlight = new Set<Request>()
  context.on('request', (request) => {
    if (request.url().startsWith(`${apiUrl}/`) && !isSubscription(request)) inFlight.add(request)
  })
  context.on('requestfinished', (request) => inFlight.delete(request))
  context.on('requestfailed', (request) => inFlight.delete(request))
  // A new document (page.reload, page.goto) cancels the old one's requests,
  // and Playwright doesn't always report those as failed (a layout save sent
  // just before page.reload never finished). The app has no same-document
  // navigations, so a navigated frame's open requests are the old document's.
  context.on('page', (page) => page.on('framenavigated', (frame) => {
    for (const request of inFlight) if (request.frame() === frame) inFlight.delete(request)
  }))

  return {
    /**
     * Stops the context's pages from sending the API anything new, then
     * waits until every request already sent has finished. Fails, naming
     * them, if some are still open after `timeout`.
     */
    async settle({ timeout = 10_000 }: { timeout?: number } = {}) {
      // New requests are aborted. A page's routes come before the context's,
      // so they go too, once the abort is in place: a request a test's route
      // still holds then goes on to the server, and is waited for below.
      await context.unrouteAll({ behavior: 'ignoreErrors' })
      // A page route that was mid-way through its own handler when it went
      // may have sent the request on already: it is then in flight, and
      // waited for below, so there is nothing to abort.
      await context.route(`${apiUrl}/**`, (route) => route.abort().catch((error: Error) => {
        if (!error.message.includes('Route is already handled')) throw error
      }))
      for (const page of context.pages()) await page.unrouteAll({ behavior: 'ignoreErrors' })
      await expect
        .poll(() => [...inFlight].map((request) => `${request.method()} ${request.url()}`), {
          message: 'API requests the test left open',
          timeout,
        })
        .toEqual([])
    },
  }
}
