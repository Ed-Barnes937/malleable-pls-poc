import path from 'path'
import { test, expect } from '@playwright/test'
import { PanelGridPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { trpcMutation } from './api'

/**
 * The toast bar shows one row (the newest two on a wider screen, the newest
 * one on a phone). Toasts that arrive together wait their turn: each is on
 * screen for its whole time, with its action, and is announced once.
 */

// The app's own toast store, as the dev server serves it (the page imports the same instance).
const TOAST_MODULE = `/@fs${path.resolve(__dirname, '../packages/workspace-shell/src/toast.tsx')}`

const TOASTS = [
  { message: 'Transcript ready', action: 'Open transcript', ms: 8000 },
  { message: 'Lecture summary ready', action: 'Read summary', ms: 8000 },
  { message: 'Audio Capture removed', action: null, ms: 4000 },
]

for (const viewport of [{ width: 400, height: 860 }, { width: 1440, height: 900 }]) {
  test.describe(`Toasts arriving together at ${viewport.width}px`, () => {
    test.use({ viewport })
    test.afterAll(async () => { await reseed() })

    test('each is shown for its whole time, with its action, and announced once', async ({ page, request }) => {
      test.setTimeout(60_000)
      await reseed()
      const board = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: 'My week' })
      await trpcMutation(request, 'workspaces.addPanel', {
        workspaceId: board.id, lensType: 'todo', slotName: 'todo', pos_x: 20, pos_y: 20, width: 360, height: 440,
      })
      await page.goto('/')
      await new TopBarPom(page).switchToWorkspace('My week')
      await expect(new PanelGridPom(page).panelByLabel('To-do')).toBeVisible()

      // Watch every frame: when each toast is on screen and whether its action is there; and what the live region adds.
      await page.evaluate(() => {
        type Seen = { from: number; to: number; action: boolean }
        const w = window as unknown as { seen: Record<string, Seen>; announced: string[] }
        w.seen = {}
        w.announced = []
        new MutationObserver((records) => {
          for (const r of records) for (const n of r.addedNodes) w.announced.push(n.textContent ?? '')
        }).observe(document.querySelector('[data-testid="toast-announcer"]')!, { childList: true })
        const tick = () => {
          for (const el of document.querySelectorAll('[data-testid="toast"]')) {
            const message = el.querySelector('span')?.textContent ?? ''
            const now = performance.now()
            const s = (w.seen[message] ??= { from: now, to: now, action: false })
            s.to = now
            if (el.querySelectorAll('button').length > 1) s.action = true
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await page.evaluate(async ({ mod, toasts }) => {
        // The very URL the app loaded it from (a dev server's update adds a query, making another instance).
        const loaded = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => new URL(n).pathname.endsWith('/workspace-shell/src/toast.tsx')).at(-1)
        const { useToastStore } = await import(/* @vite-ignore */ loaded ?? mod)
        for (const t of toasts) {
          useToastStore.getState().push({
            message: t.message, tone: 'success', ...(t.action ? { action: { label: t.action, onClick: () => {} } } : {}),
          })
        }
      }, { mod: TOAST_MODULE, toasts: TOASTS })

      // One at a time on a phone (8 + 8 + 4s), two side by side on a wider screen.
      await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 30_000 })
      const { seen, announced } = await page.evaluate(() => {
        const w = window as unknown as { seen: Record<string, { from: number; to: number; action: boolean }>; announced: string[] }
        return { seen: w.seen, announced: w.announced }
      })
      for (const t of TOASTS) {
        const s = seen[t.message]
        expect(s, t.message).toBeTruthy()
        // On screen for (about) its whole time: never cut short while waiting.
        expect(s.to - s.from, t.message).toBeGreaterThan(t.ms - 300)
        expect(s.action, t.message).toBe(!!t.action)
      }
      // Each said once, when it happened, naming its action.
      expect(announced.sort()).toEqual(TOASTS.map((t) => (t.action ? `${t.message}. Notifications has a ${t.action} button.` : t.message)).sort())
    })

    test('a toast pushed out by newer ones and shown again is announced once', async ({ page, request }) => {
      await reseed()
      await page.goto('/')
      await expect(page.getByTestId('toast-announcer')).toBeAttached()
      await page.evaluate(() => {
        const w = window as unknown as { announced: string[] }
        w.announced = []
        new MutationObserver((records) => {
          for (const r of records) for (const n of r.addedNodes) w.announced.push(n.textContent ?? '')
        }).observe(document.querySelector('[data-testid="toast-announcer"]')!, { childList: true })
      })
      const push = (message: string) => page.evaluate(async ({ mod, message }) => {
        // The very URL the app loaded it from (a dev server's update adds a query, making another instance).
        const loaded = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => new URL(n).pathname.endsWith('/workspace-shell/src/toast.tsx')).at(-1)
        const { useToastStore } = await import(/* @vite-ignore */ loaded ?? mod)
        useToastStore.getState().push({ message, tone: 'success', action: { label: 'Show', onClick: () => {} } })
      }, { mod: TOAST_MODULE, message })
      const toasts = page.getByTestId('toast-host').getByTestId('toast')
      await push('Transcript ready')
      await expect(toasts.filter({ hasText: 'Transcript ready' })).toBeVisible()
      await push('Lecture summary ready')
      await push('Connections found')
      await expect(toasts.filter({ hasText: 'Transcript ready' })).toHaveCount(0)
      // Back once a newer one goes.
      await toasts.filter({ hasText: 'Connections found' }).getByRole('button', { name: 'Dismiss' }).click()
      if (viewport.width < 640) await toasts.filter({ hasText: 'Lecture summary ready' }).getByRole('button', { name: 'Dismiss' }).click()
      await expect(toasts.filter({ hasText: 'Transcript ready' })).toBeVisible()
      const announced = await page.evaluate(() => (window as unknown as { announced: string[] }).announced)
      expect(announced.filter((m) => m === 'Transcript ready. Notifications has a Show button.')).toHaveLength(1)
    })

    test('a toast pushed out while hovered still times out once it is back', async ({ page }) => {
      await reseed()
      await page.goto('/')
      await expect(page.getByTestId('toast-announcer')).toBeAttached()
      const push = (message: string, durationMs?: number) => page.evaluate(async ({ mod, message, durationMs }) => {
        // The very URL the app loaded it from (a dev server's update adds a query, making another instance).
        const loaded = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => new URL(n).pathname.endsWith('/workspace-shell/src/toast.tsx')).at(-1)
        const { useToastStore } = await import(/* @vite-ignore */ loaded ?? mod)
        useToastStore.getState().push({ message, tone: 'success', ...(durationMs ? { durationMs } : {}) })
      }, { mod: TOAST_MODULE, message, durationMs })
      const toasts = page.getByTestId('toast-host').getByTestId('toast')
      const first = toasts.filter({ hasText: 'Transcript ready' })
      await push('Transcript ready')
      await first.hover()
      // Newer toasts take its place under the pointer; it is held as it goes.
      await push('Lecture summary ready', 600_000)
      await push('Connections found', 600_000)
      await expect(first).toHaveCount(0)
      await page.mouse.move(5, 5)
      await toasts.filter({ hasText: 'Connections found' }).getByRole('button', { name: 'Dismiss' }).click()
      if (viewport.width < 640) await toasts.filter({ hasText: 'Lecture summary ready' }).getByRole('button', { name: 'Dismiss' }).click()
      await expect(first).toBeVisible()
      // (On a phone it comes back right under the pointer, on the Dismiss just clicked.)
      await page.mouse.move(5, 5)
      // Back on screen, it counts down again (at most its 4s), rather than staying held for good.
      await expect(first).toHaveCount(0, { timeout: 5_000 })
    })
  })
}
