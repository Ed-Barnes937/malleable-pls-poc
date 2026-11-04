import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import type { Browser } from '@playwright/test'
import { test, expect } from './test'
import { watchApiRequests } from './api-requests'
import { resolveDatabaseUrl } from './db-url.mts'
import { apiUrl } from './ports'
import { reseed } from './reseed'

// The teardown e2e/test.ts runs after every test, so the next test's reseed
// never runs alongside a request the server is still working on. Each case
// opens a context of its own, so the test's own teardown is untouched.

const update = `${apiUrl}/resources.update`

/** The app in a context of its own, watched as e2e/test.ts watches every test's. */
async function openApp(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL })
  const requests = watchApiRequests(context)
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByTestId('canvas-container')).toBeVisible()
  /** Renames the seeded note from the page, as the Resources widget does; resolves to the response status, or 'failed'. */
  const renameNote = () => page.evaluate((url) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': 'dev-user-1' },
    body: JSON.stringify({ json: { id: 'res-mtdna-notes', patch: { title: 'Renamed while settling' } } }),
  }).then((response) => response.status, () => 'failed'), update)
  return { context, page, requests, renameNote }
}

test.describe('Settling API requests after a test', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('waits for a save the server is still working on, and names it at the deadline', async ({ browser, baseURL }) => {
    const pg = await import(createRequire(resolve(__dirname, '../packages/db/package.json')).resolve('postgres'))
    const sql = pg.default(resolveDatabaseUrl(), { max: 2 })
    const { context, requests, renameNote } = await openApp(browser, baseURL)
    let release!: () => void
    const releasing = new Promise<void>((done) => { release = done })
    try {
      // Another session holds the note, so the server's resources.update waits on it.
      let holding!: (pid: number) => void
      const held = new Promise<number>((done) => { holding = done })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const holder = sql.begin(async (tx: any) => {
        await tx`SELECT 1 FROM resources WHERE id = 'res-mtdna-notes' FOR UPDATE`
        holding((await tx`SELECT pg_backend_pid() AS pid`)[0].pid)
        await releasing
      })
      const pid = await held
      const renamed = renameNote()
      await expect.poll(async () =>
        (await sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`)[0].n,
      ).toBe(1)

      // The save is on the server, not the page: settle waits for it...
      await expect(requests.settle({ timeout: 300 })).rejects.toThrow(`POST ${update}`)
      // ...and returns once the server has answered.
      release()
      await holder
      await requests.settle()
      expect(await renamed).toBe(200)
      expect((await sql`SELECT title FROM resources WHERE id = 'res-mtdna-notes'`)[0].title).toBe('Renamed while settling')
    } finally {
      release()
      await context.close()
      await sql.end()
    }
  })

  test("lets a request the test's own route still holds through, and waits for it", async ({ browser, baseURL }) => {
    const { context, page, requests, renameNote } = await openApp(browser, baseURL)
    let reachedRoute!: () => void
    const reached = new Promise<void>((done) => { reachedRoute = done })
    // Held for good: the test never lets it go (as a stillness test can end).
    await page.route(update, () => { reachedRoute() })
    const finished = page.waitForEvent('requestfinished', (request) => request.url() === update).then(() => 'finished')
    const renamed = renameNote()
    await reached

    // Dropping the test's routes lets it go to the server, so settle waits for it.
    await requests.settle()
    expect(await Promise.race([finished, 'still open'])).toBe('finished')
    expect(await renamed).toBe(200)
    await context.close()
  })

  test('sends the server nothing new once settled', async ({ browser, baseURL }) => {
    const { context, requests, renameNote } = await openApp(browser, baseURL)
    await requests.settle()
    expect(await renameNote()).toBe('failed')
    await context.close()
  })
})
