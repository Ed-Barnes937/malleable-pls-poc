import { expect, type Page } from '@playwright/test'
import type { PanelGridPom } from './pom'

/**
 * With one toast up, scrolls the board to its very bottom and points at a
 * spot on it; then checks that when the toast times out the board neither
 * resizes nor scrolls, and what is under the pointer stays put.
 */
export async function expectStillAtBottomAsToastLeaves(page: Page, grid: PanelGridPom) {
  const host = page.getByTestId('toast-host')
  await expect(host.getByTestId('toast')).toHaveCount(1)
  // The widgets have finished loading and laying out (their heights settle).
  let last = ''
  await expect.poll(async () => {
    const now = await grid.root.evaluate((el) => `${el.scrollHeight}|${[...el.querySelectorAll('[data-panel-id]')].map((p) => p.getBoundingClientRect().height).join(',')}`)
    const same = now === last
    last = now
    return same
  }, { intervals: [250] }).toBe(true)
  await grid.root.evaluate((el) => { el.scrollTop = el.scrollHeight })
  const board = (await grid.root.boundingBox())!
  const point = { x: board.x + board.width / 2, y: board.y + board.height - 40 }
  await page.mouse.move(point.x, point.y)
  const under = () => page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)!
    return { el: `${el.tagName}.${el.className}`, top: Math.round(el.getBoundingClientRect().top) }
  }, point)
  const before = { top: await grid.root.evaluate((el) => el.scrollTop), under: await under() }
  await expect(host.getByTestId('toast')).toHaveCount(0, { timeout: 10000 })
  // Past the frame a resize or clamped scroll would show up in.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  expect((await grid.root.boundingBox())!.height).toBe(board.height)
  expect(await grid.root.evaluate((el) => el.scrollTop)).toBe(before.top)
  expect(await under()).toEqual(before.under)
}
