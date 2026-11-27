import type { Page } from '@playwright/test'
import { test, expect } from './test'
import { TopBarPom } from './pom'
import { reseed } from './reseed'

/** Board tabs in the order shown. */
const order = (topBar: TopBarPom) => topBar.workspaceTabs.evaluateAll((els) => els.map((el) => el.querySelector('button')?.textContent?.trim()))

/** The order once the strip has rendered. */
async function initialOrder(topBar: TopBarPom) {
  await expect(topBar.workspaceTabs.first()).toBeVisible()
  return (await order(topBar)) as string[]
}

/** Counts the writes the page sends to workspaces.reorder. */
function countReorderWrites(page: Page) {
  const writes: string[] = []
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('workspaces.reorder')) writes.push(req.postData() ?? '')
  })
  return writes
}

const spoken = (page: Page) => page.locator('[data-ui-sdk-announcer="assertive"]')

test.describe('Board tab reorder', () => {
  test.beforeEach(async () => { await reseed() })

  test('Space picks a tab up, arrows move it, Space drops it: one write, survives a reload', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const writes = countReorderWrites(page)
    const before = await initialOrder(topBar)
    expect(before.length).toBeGreaterThanOrEqual(3)
    // The open board is the first; move a different tab so a stray click would show.
    const moved = before[1]
    const total = before.length

    await topBar.workspaceTab(moved).focus()
    await page.keyboard.press('Space')
    await expect(spoken(page)).toHaveText(`Picked up ${moved} board, position 2 of ${total}.`)
    await page.keyboard.press('ArrowLeft')
    await expect(spoken(page)).toHaveText(`${moved} board moved to position 1 of ${total}`)
    // From position 1, one ArrowRight per step reaches the last position.
    const rights = total - 1
    for (let i = 0; i < rights; i++) await page.keyboard.press('ArrowRight')
    await expect(spoken(page)).toHaveText(`${moved} board moved to position ${total} of ${total}`)
    expect(writes).toHaveLength(0)
    await page.keyboard.press('Space')
    await expect(spoken(page)).toHaveText(`${moved} board dropped at position ${total} of ${total}`)

    const expected = [before[0], ...before.slice(2), moved]
    await expect.poll(() => order(topBar)).toEqual(expected)
    await expect.poll(() => writes.length).toBe(1)
    // Dropping with the keyboard does not open the board that was moved.
    await expect(topBar.workspaceTab(moved)).not.toHaveAttribute('aria-current', 'page')
    await expect(topBar.workspaceTab(moved)).toBeFocused()

    await page.reload()
    await expect.poll(() => order(topBar)).toEqual(expected)
  })

  test('Escape puts the tab back and writes nothing', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const writes = countReorderWrites(page)
    const before = await initialOrder(topBar)

    await topBar.workspaceTab(before[1]).focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => order(topBar)).toEqual([before[1], before[0], ...before.slice(2)])
    await page.keyboard.press('Escape')
    await expect.poll(() => order(topBar)).toEqual(before)
    await expect(spoken(page)).toHaveText(`Move cancelled. ${before[1]} board is back at position 2 of ${before.length}`)
    await page.waitForTimeout(300)
    expect(writes).toHaveLength(0)
  })

  test('Enter opens a board from the keyboard; it does not pick the tab up', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const before = await initialOrder(topBar)
    const other = before[1]

    await topBar.workspaceTab(other).focus()
    await page.keyboard.press('Enter')
    await topBar.expectActiveWorkspace(other)
    await page.keyboard.press('ArrowRight')
    expect(await order(topBar)).toEqual(before)
  })

  test('dragging a tab with the mouse reorders on drop: one write, board not switched', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const writes = countReorderWrites(page)
    const before = await initialOrder(topBar)
    const active = before[0]
    await topBar.expectActiveWorkspace(active)

    const from = (await topBar.workspaceTab(before[1]).boundingBox())!
    const last = (await topBar.workspaceTab(before[before.length - 1]).boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(last.x + last.width - 4, last.y + last.height / 2, { steps: 12 })
    await page.mouse.up()

    const expected = [before[0], ...before.slice(2), before[1]]
    await expect.poll(() => order(topBar)).toEqual(expected)
    await expect.poll(() => writes.length).toBe(1)
    await topBar.expectActiveWorkspace(active)
  })

  test('a plain click still opens a board', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBarPom(page)
    const before = await initialOrder(topBar)
    await topBar.switchToWorkspace(before[2])
    await topBar.expectActiveWorkspace(before[2])
    expect(await order(topBar)).toEqual(before)
  })
})
