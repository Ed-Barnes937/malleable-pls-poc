import { test, expect, type Page } from '@playwright/test'
import { TopBarPom, CreateWorkspaceDialogPom, PanelGridPom } from './pom'
import { reseed } from './reseed'

/**
 * A starter lays its widgets out as a group to fit the visible board
 * (`layoutGroup`): in one row, shrunk towards minimum widths if need be, else
 * in columns, heights filling the view. Every widget starts fully in view,
 * none overlap, the board doesn't scroll, and the layout is saved as placed.
 * (The drawer is a modal overlay, so it never narrows the board.)
 */

type Box = { x: number; y: number; width: number; height: number }

const STARTERS = [
  { title: 'Plan my time', widgets: ['Calendar', 'To-do', 'Coming up'] },
  { title: 'Capture a lecture', widgets: ['Audio Capture', 'Transcript', 'Resources'] },
  { title: 'Find what to revise', widgets: ['Weakest Topics', 'Your Progress'] },
]

const VIEWPORTS = [
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

async function newBoard(page: Page, name: string) {
  const topBar = new TopBarPom(page)
  const grid = new PanelGridPom(page)
  await page.goto('/')
  await topBar.openCreateWorkspaceDialog()
  await new CreateWorkspaceDialogPom(page).createWorkspace(name)
  await topBar.expectActiveWorkspace(name)
  await grid.expectEmpty()
  return grid
}

/** A panel's saved layout (the style the canvas sets, not mid-animation geometry), in board coordinates. */
function layout(grid: PanelGridPom, label: string): Promise<Box> {
  return grid.panelByLabel(label).evaluate((el: HTMLElement) => ({
    x: parseFloat(el.style.left), y: parseFloat(el.style.top),
    width: parseFloat(el.style.width), height: parseFloat(el.style.height),
  }))
}

function boardSize(grid: PanelGridPom) {
  return grid.root.evaluate((el) => ({
    clientWidth: el.clientWidth, clientHeight: el.clientHeight, scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight,
  }))
}

test.describe('A starter fits its widgets to the visible board', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  for (const viewport of VIEWPORTS) {
    for (const starter of STARTERS) {
      test(`"${starter.title}" at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport)
        const name = `${starter.title} ${viewport.width}`
        const grid = await newBoard(page, name)
        await grid.starter(starter.title).click()
        await grid.expectPanelCount(starter.widgets.length)
        await expect(page.getByTestId('toast-host')).toContainText(' added')

        const boxes = await Promise.all(starter.widgets.map((label) => layout(grid, label)))
        const board = await boardSize(grid)
        // Fully inside the visible board.
        for (const b of boxes) {
          expect(b.x).toBeGreaterThanOrEqual(0)
          expect(b.y).toBeGreaterThanOrEqual(0)
          expect(b.x + b.width).toBeLessThanOrEqual(board.clientWidth)
          expect(b.y + b.height).toBeLessThanOrEqual(board.clientHeight)
        }
        // The board scrolls neither across nor down.
        expect(board.scrollWidth).toBeLessThanOrEqual(board.clientWidth)
        expect(board.scrollHeight).toBeLessThanOrEqual(board.clientHeight)
        // No two overlap, and they read in starter order: each one below the
        // last in the same column, or in a column to its right.
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false)
        }
        for (let i = 1; i < boxes.length; i++) {
          const [a, b] = [boxes[i - 1]!, boxes[i]!]
          const below = b.x === a.x && b.y >= a.y + a.height
          expect(below || b.x >= a.x + a.width).toBe(true)
        }

        // Saved as placed.
        await page.reload()
        await new TopBarPom(page).switchToWorkspace(name)
        await grid.expectPanelCount(starter.widgets.length)
        expect(await Promise.all(starter.widgets.map((label) => layout(grid, label)))).toEqual(boxes)
      })
    }
  }

  test('"Capture a lecture" puts Resources in a column of its own beside Audio Capture over Transcript when one row does not fit', async ({ page }) => {
    // 900 wide: the row needs 940 at minimum widths.
    await page.setViewportSize({ width: 900, height: 800 })
    const grid = await newBoard(page, 'Lectures')
    await grid.starter('Capture a lecture').click()
    await grid.expectPanelCount(3)
    const [record, transcript, resources] = await Promise.all(['Audio Capture', 'Transcript', 'Resources'].map((l) => layout(grid, l)))
    expect(transcript!.x).toBe(record!.x)
    expect(transcript!.y).toBeGreaterThan(record!.y + record!.height)
    expect(resources!.x).toBeGreaterThan(record!.x + record!.width)
    expect(resources!.y).toBe(record!.y)
    const board = await boardSize(grid)
    expect(board.scrollWidth).toBeLessThanOrEqual(board.clientWidth)
    expect(board.scrollHeight).toBeLessThanOrEqual(board.clientHeight)
  })

  test('on a phone the starter stacks its widgets in starter order', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 860 })
    const grid = await newBoard(page, 'Lectures')
    await grid.starter('Capture a lecture').click()
    await grid.expectPanelCount(3)
    await expect(grid.root).toHaveAttribute('data-layout', 'stack')
    const tops = []
    for (const label of ['Audio Capture', 'Transcript', 'Resources']) {
      const box = (await grid.panelByLabel(label).boundingBox())!
      // One column across the board.
      expect(box.x + box.width).toBeLessThanOrEqual(400)
      tops.push(box.y)
    }
    expect(tops).toEqual([...tops].sort((a, b) => a - b))
    const board = await boardSize(grid)
    expect(board.scrollWidth).toBeLessThanOrEqual(board.clientWidth)
  })
})
