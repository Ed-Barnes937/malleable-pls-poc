import { test, expect } from '@playwright/experimental-ct-react'
import type { Page } from '@playwright/test'
import { BoardHarness } from './test-helpers'
import { THEMES, setTheme, tokenColor } from '../../shared-ui/src/ct-themes'
import type { PanelItem } from './canvas-store'

test.use({ viewport: { width: 1100, height: 800 } })

// The board is 1000 x 700. Plan is on top (pressing it raises nothing, so
// every save a test counts comes from a move or a resize).
const NOTES: PanelItem = { id: 'notes', pos_x: 40, pos_y: 40, width: 300, height: 200, z_index: 1, title: 'Notes' }
const PLAN: PanelItem = { id: 'plan', pos_x: 500, pos_y: 300, width: 300, height: 200, z_index: 2, title: 'Plan' }

/** The board, and every layout it saves. */
function board(panels: PanelItem[] = [NOTES, PLAN], width?: number) {
  const saves: PanelItem[][] = []
  const jsx = <BoardHarness panels={panels} width={width} onLayoutChange={(layout) => { saves.push(layout) }} />
  return { jsx, saves }
}

const panel = (page: Page, id: string) => page.locator(`[data-panel-id="${id}"]`)

/** A panel's box on the board as laid out (left, top, width, height), so the lift while dragged doesn't count. */
async function boxOf(page: Page, id: string) {
  return panel(page, id).evaluate((el) => {
    const style = getComputedStyle(el)
    const px = (v: string) => Math.round(parseFloat(v))
    return { x: px(style.left), y: px(style.top), width: px(style.width), height: px(style.height) }
  })
}

/** Presses at a point on the panel's header (clear of its buttons) and moves by (dx, dy), still held. */
async function grabHeader(page: Page, id: string, dx: number, dy: number) {
  const header = (await panel(page, id).getByTestId('panel-header').boundingBox())!
  const from = { x: header.x + 80, y: header.y + header.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 })
}

async function grabHandle(page: Page, name: string, dx: number, dy: number) {
  const handle = page.getByRole('button', { name })
  // Handles take the pointer once the panel is hovered.
  await handle.locator('xpath=ancestor::*[@data-panel-id]').hover({ position: { x: 150, y: 100 } })
  const box = (await handle.boundingBox())!
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 })
}

const announced = (page: Page) => page.locator('[data-ui-sdk-announcer="assertive"]')

test.describe('moving a panel by its header', () => {
  test('it shows where it will land while dragging, lands on the 20px grid and saves once', async ({ mount, page }) => {
    const { jsx, saves } = board()
    await mount(jsx)
    await grabHeader(page, 'plan', 103, 57)

    // Already snapped mid-drag: 603 -> 600, 357 -> 360.
    await expect(panel(page, 'plan')).toHaveAttribute('data-dragging', '')
    await expect.poll(() => boxOf(page, 'plan')).toEqual({ x: 600, y: 360, width: 300, height: 200 })
    expect(saves).toHaveLength(0)

    // Every frame after the drop shows it where it landed: no slide over from its old spot.
    await panel(page, 'plan').evaluate((el) => {
      const w = window as unknown as { __lefts: Promise<number[]> }
      w.__lefts = new Promise((resolve) => {
        const lefts: number[] = []
        const tick = () => {
          lefts.push(Math.round(parseFloat(getComputedStyle(el).left)))
          if (lefts.length < 15) requestAnimationFrame(tick)
          else resolve(lefts)
        }
        window.addEventListener('pointerup', () => requestAnimationFrame(tick), { once: true, capture: true })
      })
    })
    await page.mouse.up()
    const lefts = await page.evaluate(() => (window as unknown as { __lefts: Promise<number[]> }).__lefts)
    expect(new Set(lefts)).toEqual(new Set([600]))
    await expect(panel(page, 'plan')).not.toHaveAttribute('data-dragging')
    expect(await boxOf(page, 'plan')).toEqual({ x: 600, y: 360, width: 300, height: 200 })
    expect(saves).toHaveLength(1)
    expect(saves[0]!.find((p) => p.id === 'plan')).toMatchObject({ pos_x: 600, pos_y: 360 })
    await expect(announced(page)).toHaveText('Plan moved to 600, 360.')
  })

  test('a drag past the edge keeps the panel on the board while dragging, not only on release', async ({ mount, page }) => {
    const { jsx, saves } = board()
    await mount(jsx)
    await grabHeader(page, 'plan', 900, 900)

    // 100px stays on the board: x <= 1000 - 100, y <= 700 - 100.
    await expect.poll(() => boxOf(page, 'plan')).toEqual({ x: 900, y: 600, width: 300, height: 200 })
    await page.mouse.up()
    expect(await boxOf(page, 'plan')).toEqual({ x: 900, y: 600, width: 300, height: 200 })
    expect(saves).toHaveLength(1)
  })

  test('Escape puts a dragged panel back, saves nothing and keeps it selected', async ({ mount, page }) => {
    const { jsx, saves } = board()
    await mount(jsx)
    await grabHeader(page, 'plan', 103, 57)
    await expect.poll(() => boxOf(page, 'plan')).toMatchObject({ x: 600, y: 360 })

    await page.keyboard.press('Escape')
    await expect(panel(page, 'plan')).not.toHaveAttribute('data-dragging')
    // It glides back.
    await expect.poll(() => boxOf(page, 'plan')).toEqual({ x: 500, y: 300, width: 300, height: 200 })
    await page.mouse.up()
    expect(await boxOf(page, 'plan')).toEqual({ x: 500, y: 300, width: 300, height: 200 })
    expect(saves).toHaveLength(0)
    // The canvas's own Escape (clear the selection) didn't also run.
    await expect(page.getByRole('button', { name: 'Resize Plan right' })).toHaveAttribute('tabindex', '0')
  })

  test('pressing a panel on a board where every panel shares z_index 0 brings it to front', async ({ mount, page }) => {
    await mount(board([{ ...NOTES, z_index: 0 }, { ...PLAN, pos_x: 200, pos_y: 100, z_index: 0 }]).jsx)
    const z = (id: string) => panel(page, id).evaluate((el) => Number(getComputedStyle(el).zIndex))
    await panel(page, 'notes').getByTestId('panel-header').click({ position: { x: 80, y: 20 } })
    expect(await z('notes')).toBeGreaterThan(await z('plan'))
  })
})

test.describe('resizing a panel by a handle', () => {
  test('a corner drag resizes on the 20px grid, shown while dragging, and saves once', async ({ mount, page }) => {
    const { jsx, saves } = board()
    await mount(jsx)
    await grabHandle(page, 'Resize Plan bottom right', 97, 13)

    // 397 -> 400, 213 -> 220; the top-left corner stays put.
    await expect.poll(() => boxOf(page, 'plan')).toEqual({ x: 500, y: 300, width: 400, height: 220 })
    await page.mouse.up()
    expect(await boxOf(page, 'plan')).toEqual({ x: 500, y: 300, width: 400, height: 220 })
    expect(saves).toHaveLength(1)
    await expect(announced(page)).toHaveText('Plan resized to 400 by 220.')
  })

  test('Shift on a corner keeps the panel’s shape', async ({ mount, page }) => {
    await mount(board().jsx)
    await page.keyboard.down('Shift')
    await grabHandle(page, 'Resize Plan bottom right', 97, 13)
    // 3:2 kept from the wider change: 397 x 264.7, on the grid 400 x 260.
    await expect.poll(() => boxOf(page, 'plan')).toEqual({ x: 500, y: 300, width: 400, height: 260 })
    await page.mouse.up()
    await page.keyboard.up('Shift')
    expect(await boxOf(page, 'plan')).toEqual({ x: 500, y: 300, width: 400, height: 260 })
  })

  test('a top-left drag keeps the bottom-right corner and stops at the widget minimum while dragging', async ({ mount, page }) => {
    await mount(board([NOTES, { ...PLAN, width: 400, height: 300, constraints: { minWidth: 300, minHeight: 240 } }]).jsx)
    await grabHandle(page, 'Resize Plan top left', 300, 300)
    await expect.poll(() => boxOf(page, 'plan')).toEqual({ x: 600, y: 360, width: 300, height: 240 })
    await page.mouse.up()
    expect(await boxOf(page, 'plan')).toEqual({ x: 600, y: 360, width: 300, height: 240 })
  })
})

test.describe('transitions while dragging', () => {
  /** The box properties the panel's computed `transition-property` lists. */
  const boxTransitions = (page: Page, id: string) => panel(page, id).evaluate((el) =>
    getComputedStyle(el).transitionProperty.split(',').map((p) => p.trim()).filter((p) => ['left', 'top', 'width', 'height'].includes(p)))

  test('a panel glides its box when laid out, but not while its header is dragged', async ({ mount, page }) => {
    await mount(board().jsx)
    expect(await boxTransitions(page, 'plan')).toEqual(['left', 'top', 'width', 'height'])
    await grabHeader(page, 'plan', 103, 57)
    await expect(panel(page, 'plan')).toHaveAttribute('data-dragging', '')
    expect(await boxTransitions(page, 'plan')).toEqual([])
    await page.mouse.up()
  })

  test('nor while a handle resizes it', async ({ mount, page }) => {
    await mount(board().jsx)
    await grabHandle(page, 'Resize Plan bottom right', 97, 13)
    await expect.poll(() => boxOf(page, 'plan')).toEqual({ x: 500, y: 300, width: 400, height: 220 })
    expect(await boxTransitions(page, 'plan')).toEqual([])
    await page.mouse.up()
  })
})

test.describe('by keyboard', () => {
  test('Alt+arrow moves the selected panel 20px; a held key saves once it stops', async ({ mount, page }) => {
    const { jsx, saves } = board()
    await mount(jsx)
    await panel(page, 'plan').getByTestId('panel-header').click({ position: { x: 80, y: 20 } })

    // A key move glides to its spot.
    await page.keyboard.press('Alt+ArrowRight')
    await expect.poll(() => boxOf(page, 'plan')).toMatchObject({ x: 520, y: 300 })
    await expect(announced(page)).toHaveText('Plan moved to 520, 300.')

    // One press, one save.
    await expect.poll(() => saves.length).toBe(1)
    expect(saves[0]!.find((p) => p.id === 'plan')).toMatchObject({ pos_x: 520, pos_y: 300 })

    // A held key: the keyboard repeats keydown (repeat: true) far faster than
    // the save delay. Dispatched in one go so a busy machine can't space them out.
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, repeat: i > 0, bubbles: true, cancelable: true }))
      }
    })
    await expect.poll(() => boxOf(page, 'plan')).toMatchObject({ x: 520, y: 400 })
    await expect.poll(() => saves.length).toBe(2)
    expect(saves[1]!.find((p) => p.id === 'plan')).toMatchObject({ pos_x: 520, pos_y: 400 })
    await page.waitForTimeout(600)
    expect(saves).toHaveLength(2)
  })

  test("Tab reaches only the selected panel's handles; arrows on one resize along its edge", async ({ mount, page }) => {
    await mount(board().jsx)
    await panel(page, 'plan').getByTestId('panel-header').click({ position: { x: 80, y: 20 } })

    // From Notes (not selected: no handle stops) straight into Plan's handles.
    await page.getByRole('button', { name: 'Remove Notes from board' }).focus()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Resize Plan top left' })).toBeFocused()
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab')
    const right = page.getByRole('button', { name: 'Resize Plan right' })
    await expect(right).toBeFocused()

    await page.keyboard.press('ArrowRight')
    await expect.poll(() => boxOf(page, 'plan')).toEqual({ x: 500, y: 300, width: 320, height: 200 })
    await expect(announced(page)).toHaveText('Plan resized to 320 by 200.')
    // Shift: ten steps; the widget minimum (200 wide by default) stops it.
    await page.keyboard.press('Shift+ArrowLeft')
    await expect.poll(() => boxOf(page, 'plan')).toEqual({ x: 500, y: 300, width: 200, height: 200 })
  })

  for (const theme of THEMES) {
    test(`a focused handle shows in the accent colour (${theme})`, async ({ mount, page }) => {
      await setTheme(page, theme)
      await mount(board().jsx)
      await panel(page, 'plan').getByTestId('panel-header').click({ position: { x: 80, y: 20 } })
      await page.getByRole('button', { name: 'Remove Notes from board' }).focus()
      await page.keyboard.press('Tab')
      await expect(page.getByRole('button', { name: 'Resize Plan top left' }))
        .toHaveCSS('background-color', await tokenColor(page, '--color-accent'))
    })
  }
})

test('a narrow board stacks the panels: no handles, and a header drag moves nothing', async ({ mount, page }) => {
  const { jsx, saves } = board([NOTES, PLAN], 500)
  await mount(jsx)
  await expect(page.getByTestId('canvas-container')).toHaveAttribute('data-layout', 'stack')
  await expect(page.getByRole('button', { name: /^Resize / })).toHaveCount(0)

  const layoutBox = () => panel(page, 'plan').evaluate((el) => [(el as HTMLElement).offsetLeft, (el as HTMLElement).offsetTop])
  const before = await layoutBox()
  await grabHeader(page, 'plan', 60, 80)
  await page.mouse.up()
  expect(await layoutBox()).toEqual(before)
  await page.keyboard.press('Alt+ArrowRight')
  expect(await layoutBox()).toEqual(before)
  expect(saves).toHaveLength(0)
})
