import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { PanelGridPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { trpcMutation, trpcQuery } from './api'

/**
 * Flow audit 05: a canvas that's hard to break. Placement is free and widgets
 * may overlap; Shift snaps to the grid and nudges what the widget would
 * cover; Tidy up fills the board, Calendar first, with Undo. No widget is
 * ever cut off at the bottom, and a gesture saves once, at its end.
 */

test.use({ viewport: { width: 1440, height: 900 } })

interface Panel { id: string; lens_type: string; pos_x: number; pos_y: number; width: number; height: number }
interface Box { x: number; y: number; width: number; height: number }

const BOARD = 'Canvas board'

/** The demo board's three planning widgets, as laid out by the demo runbook. */
async function planningBoard(request: APIRequestContext) {
  const ws = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: BOARD })
  const panels = [
    { lensType: 'calendar', pos_x: 20, pos_y: 20, width: 900, height: 760 },
    { lensType: 'todo', pos_x: 940, pos_y: 20, width: 360, height: 440 },
    { lensType: 'coming-up', pos_x: 940, pos_y: 480, width: 360, height: 320 },
  ]
  for (const p of panels) await trpcMutation(request, 'workspaces.addPanel', { workspaceId: ws.id, slotName: p.lensType, ...p })
  return ws.id
}

async function open(page: Page) {
  await page.goto('/')
  await new TopBarPom(page).switchToWorkspace(BOARD)
  const grid = new PanelGridPom(page)
  await grid.expectPanelCount(3)
  return grid
}

/** Each layout save the page sends, as the panel ids it names. */
function recordSaves(page: Page): string[][] {
  const saves: string[][] = []
  page.on('request', (req) => {
    if (!req.url().includes('workspaces.updateLayouts')) return
    saves.push([...(req.postData() ?? '').matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]!))
  })
  return saves
}

/** A panel's box on the board (its layout, not a glide in flight). */
function layoutOf(panel: Locator): Promise<Box> {
  return panel.evaluate((el: HTMLElement) => ({
    x: Number(el.style.left.replace('px', '')),
    y: Number(el.style.top.replace('px', '')),
    width: el.offsetWidth,
    height: el.offsetHeight,
  }))
}

const overlap = (a: Box, b: Box) =>
  Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)

/** Every widget can be scrolled fully into view: none is cut off at the bottom. */
async function expectNoneCutOff(grid: PanelGridPom) {
  const cut = await grid.root.evaluate((canvas) =>
    [...canvas.querySelectorAll<HTMLElement>('[data-panel-id]')]
      .filter((p) => p.offsetTop + p.offsetHeight > canvas.scrollHeight)
      .map((p) => p.dataset.panelId))
  expect(cut).toEqual([])
}

/** Drags `panel` by its header by `dx`, `dy`, with Shift held when asked. */
async function drag(page: Page, panel: Locator, dx: number, dy: number, { shift = false } = {}) {
  const header = (await panel.getByTestId('panel-header').boundingBox())!
  const from = { x: header.x + 80, y: header.y + header.height / 2 }
  await page.mouse.move(from.x, from.y)
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 15 })
}

async function drop(page: Page, { shift = false } = {}) {
  await page.mouse.up()
  if (shift) await page.keyboard.up('Shift')
}

/** The saved layout, by lens type, once it reads `expected` for `lensType`. */
async function savedLayout(request: APIRequestContext, boardId: string) {
  const rows = await trpcQuery<Panel[]>(request, 'workspaces.panels', boardId)
  return new Map(rows.map((r) => [r.lens_type, { x: Number(r.pos_x), y: Number(r.pos_y), width: Number(r.width), height: Number(r.height) }]))
}

test.describe('The canvas', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('a free drag can overlap another widget, and saves once, only the widget moved', async ({ page, request }) => {
    const id = await planningBoard(request)
    const grid = await open(page)
    const saves = recordSaves(page)
    const todo = grid.panelByLabel('To-do')
    const calendar = grid.panelByLabel('Calendar')

    await drag(page, todo, -300, 100)
    await drop(page)
    await expect.poll(() => layoutOf(todo)).toMatchObject({ x: 640, y: 120 })
    expect(overlap(await layoutOf(todo), await layoutOf(calendar))).toBe(true)
    expect(await layoutOf(calendar)).toMatchObject({ x: 20, y: 20 })

    await expect.poll(async () => (await savedLayout(request, id)).get('todo')).toMatchObject({ x: 640, y: 120 })
    expect(saves).toEqual([[await todo.getAttribute('data-panel-id')]])
    await expectNoneCutOff(grid)
  })

  test('a Shift drag snaps to the grid, shows where it and its neighbour land, and nudges the neighbour off', async ({ page, request }) => {
    const id = await planningBoard(request)
    const grid = await open(page)
    const saves = recordSaves(page)
    const todo = grid.panelByLabel('To-do')
    const comingUp = grid.panelByLabel('Coming up')

    // Coming up dragged up over the To-do.
    await drag(page, comingUp, 7, -403, { shift: true })
    const outline = page.getByTestId('snap-outline')
    await expect(outline).toBeVisible()
    await expect(page.getByTestId('snap-outline-nudge')).toHaveAttribute('data-panel-for', (await todo.getAttribute('data-panel-id'))!)
    await drop(page, { shift: true })
    await expect(outline).toHaveCount(0)

    await expect.poll(() => layoutOf(comingUp)).toMatchObject({ x: 940, y: 80 })
    const up = await layoutOf(comingUp)
    await expect.poll(async () => overlap(await layoutOf(todo), up)).toBe(false)
    const nudged = await layoutOf(todo)
    expect(nudged.x % 20).toBe(0)
    expect(nudged.y % 20).toBe(0)
    expect(overlap(nudged, await layoutOf(grid.panelByLabel('Calendar')))).toBe(false)

    // Saved once, both widgets, and they come back there after a reload.
    await expect.poll(async () => (await savedLayout(request, id)).get('todo')).toMatchObject({ x: nudged.x, y: nudged.y })
    expect(saves).toHaveLength(1)
    expect(saves[0]!.length).toBe(2)
    await page.reload()
    await expect.poll(() => layoutOf(todo)).toMatchObject({ x: nudged.x, y: nudged.y })
    await expectNoneCutOff(grid)
  })

  test('with no free spot in view, a nudged widget goes below and the board grows to fit it', async ({ page, request }) => {
    await planningBoard(request)
    const grid = await open(page)
    const todo = grid.panelByLabel('To-do')
    const calendar = grid.panelByLabel('Calendar')
    // The Calendar, Shift-dragged right over both, leaves no room beside it.
    await drag(page, calendar, 200, 0, { shift: true })
    await drop(page, { shift: true })
    await expect.poll(async () => overlap(await layoutOf(todo), await layoutOf(calendar))).toBe(false)
    const canvas = await grid.root.evaluate((el) => ({ scroll: el.scrollHeight, view: el.clientHeight }))
    expect(canvas.scroll).toBeGreaterThan(canvas.view)
    await expectNoneCutOff(grid)
    // Scrolled to the bottom, the lowest widget shows whole.
    await grid.root.evaluate((el) => { el.scrollTop = el.scrollHeight })
    const lowest = (await layoutOf(todo)).y > (await layoutOf(grid.panelByLabel('Coming up'))).y ? todo : grid.panelByLabel('Coming up')
    await expect(lowest).toBeInViewport({ ratio: 1 })
  })

  test('Tidy up fills the board with the Calendar leading; Undo puts the layout back, after a reload too', async ({ page, request }) => {
    const id = await planningBoard(request)
    // A messy board: the To-do over the Calendar.
    const rows = await trpcQuery<Panel[]>(request, 'workspaces.panels', id)
    await trpcMutation(request, 'workspaces.updateLayouts', rows.map((r) => ({
      id: r.id, pos_x: r.lens_type === 'todo' ? 300 : Number(r.pos_x), pos_y: r.lens_type === 'todo' ? 300 : Number(r.pos_y),
      width: Number(r.width), height: Number(r.height), z_index: r.lens_type === 'todo' ? 5 : 1,
    })))
    const grid = await open(page)
    const before = await savedLayout(request, id)
    const main = (await page.locator('main').boundingBox())!

    await page.getByRole('button', { name: 'Tidy up widgets' }).click()
    const calendar = await layoutOf(grid.panelByLabel('Calendar'))
    expect(calendar).toMatchObject({ x: 20, y: 20, width: 900, height: Math.round(main.height) - 40 })
    const boxes = await Promise.all(['Calendar', 'To-do', 'Coming up'].map((l) => layoutOf(grid.panelByLabel(l))))
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!)).toBe(false)
    }
    // The rest fill the right of the board, to its bottom.
    expect(Math.max(...boxes.map((b) => b.x + b.width))).toBe(Math.round(main.width) - 20)
    expect(Math.max(...boxes.map((b) => b.y + b.height))).toBe(Math.round(main.height) - 20)
    await expectNoneCutOff(grid)
    await expect(grid.root).toHaveJSProperty('scrollTop', 0)
    await expect.poll(async () => (await savedLayout(request, id)).get('calendar')?.height).toBe(Math.round(main.height) - 40)

    const toast = page.getByTestId('toast').filter({ hasText: 'Widgets tidied up' })
    await toast.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(async () => savedLayout(request, id)).toEqual(before)
    await page.reload()
    await expect.poll(() => layoutOf(grid.panelByLabel('To-do'))).toMatchObject({ x: 300, y: 300 })
    await expectNoneCutOff(grid)
  })

  test("Tidy up's Undo goes once a widget is added", async ({ page, request }) => {
    await planningBoard(request)
    await open(page)
    await page.getByRole('button', { name: 'Tidy up widgets' }).click()
    const toast = page.getByTestId('toast').filter({ hasText: 'Widgets tidied up' })
    await expect(toast).toBeVisible()
    await page.getByRole('button', { name: 'Remove Coming up from board' }).click()
    await expect(toast).toHaveCount(0)
  })

  test('a resize past the bottom of the board grows the board, so the widget is never cut off', async ({ page, request }) => {
    await planningBoard(request)
    const grid = await open(page)
    const comingUp = grid.panelByLabel('Coming up')
    await comingUp.hover()
    const handle = (await comingUp.getByTestId('resize-handle-s').boundingBox())!
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + handle.width / 2, 895, { steps: 10 })
    await page.mouse.up()
    await expectNoneCutOff(grid)
  })
})
