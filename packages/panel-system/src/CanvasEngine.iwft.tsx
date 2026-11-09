import { test, expect } from '../../../playwright/fixtures'
import type { Locator, Page } from '@playwright/test'
import { CanvasHarness } from './test-helpers'
import type { PanelItem } from './canvas-store'

test.use({ viewport: { width: 1280, height: 860 } })

const A: PanelItem = { id: 'a', pos_x: 20, pos_y: 20, width: 300, height: 200, z_index: 1 }
const B: PanelItem = { id: 'b', pos_x: 400, pos_y: 20, width: 300, height: 200, z_index: 2 }

/** A panel's box on the canvas (its layout, not a glide in flight). */
async function layoutOf(panel: Locator) {
  return panel.evaluate((el: HTMLElement) => ({ x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight }))
}

function overlap(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)
}

/** Presses `panel`'s header and moves the pointer by `dx`, `dy` in steps, leaving it pressed. */
async function startDrag(page: Page, panel: Locator, dx: number, dy: number) {
  const header = (await panel.getByTestId('panel-header').boundingBox())!
  const from = { x: header.x + 60, y: header.y + header.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 })
  return from
}

test.describe('Canvas gestures', () => {
  test('a free drag can overlap another widget, and saves once, only the widget moved', async ({ mount, page }) => {
    const saves: PanelItem[][] = []
    const component = await mount(<CanvasHarness panels={[A, B]} onSave={(s) => saves.push(s)} />)
    const a = component.getByTestId('panel-a')
    await startDrag(page, a, 393, 33)
    await page.mouse.up()

    await expect.poll(() => layoutOf(a)).toMatchObject({ x: 413, y: 53 })
    expect(overlap(await layoutOf(a), await layoutOf(component.getByTestId('panel-b')))).toBe(true)
    await expect(component.getByTestId('panel-b')).toHaveCSS('left', '400px')
    await expect(component.getByTestId('snap-outline')).toHaveCount(0)
    await expect.poll(() => saves.length).toBe(1)
    expect(saves[0]!.map((p) => p.id)).toEqual(['a'])
  })

  test('a drag with Shift held snaps to the grid, shows where it and its neighbour land, and nudges the neighbour', async ({ mount, page }) => {
    const saves: PanelItem[][] = []
    const component = await mount(<CanvasHarness panels={[A, B]} onSave={(s) => saves.push(s)} />)
    const a = component.getByTestId('panel-a')
    const b = component.getByTestId('panel-b')
    await page.keyboard.down('Shift')
    await startDrag(page, a, 393, 33)

    const outline = component.getByTestId('snap-outline')
    await expect(outline).toBeVisible()
    await expect(outline).toHaveCSS('left', '420px')
    await expect(outline).toHaveCSS('top', '60px')
    const nudgeOutline = component.getByTestId('snap-outline-nudge')
    await expect(nudgeOutline).toHaveAttribute('data-panel-for', 'b')
    expect(saves).toHaveLength(0)

    await page.mouse.up()
    await page.keyboard.up('Shift')
    await expect.poll(() => layoutOf(a)).toMatchObject({ x: 420, y: 60 })
    // The neighbour lands where its outline was, clear of the dropped widget.
    const landed = await layoutOf(b)
    expect(overlap(landed, await layoutOf(a))).toBe(false)
    expect(landed.x % 20).toBe(0)
    expect(landed.y % 20).toBe(0)
    await expect(outline).toHaveCount(0)
    await expect.poll(() => saves.length).toBe(1)
    expect(saves[0]!.map((p) => p.id).sort()).toEqual(['a', 'b'])
  })

  test('letting go of Shift mid-drag is back to free placement', async ({ mount, page }) => {
    const component = await mount(<CanvasHarness panels={[A, B]} />)
    const a = component.getByTestId('panel-a')
    await page.keyboard.down('Shift')
    const from = await startDrag(page, a, 393, 33)
    await expect(component.getByTestId('snap-outline')).toBeVisible()
    await page.keyboard.up('Shift')
    await expect(component.getByTestId('snap-outline')).toHaveCount(0)
    await page.mouse.move(from.x + 391, from.y + 31, { steps: 2 })
    await page.mouse.up()

    await expect.poll(() => layoutOf(a)).toMatchObject({ x: 411, y: 51 })
    await expect(component.getByTestId('panel-b')).toHaveCSS('left', '400px')
  })

  test('a resize with Shift held snaps its edges to the grid and nudges what it would cover', async ({ mount, page }) => {
    const component = await mount(<CanvasHarness panels={[A, B]} />)
    const a = component.getByTestId('panel-a')
    await a.hover()
    const handle = (await a.getByTestId('resize-handle-e').boundingBox())!
    await page.keyboard.down('Shift')
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + 143, handle.y + handle.height / 2, { steps: 8 })
    await expect(component.getByTestId('snap-outline-nudge')).toHaveAttribute('data-panel-for', 'b')
    await page.mouse.up()
    await page.keyboard.up('Shift')

    const box = await layoutOf(a)
    expect(box.width % 20).toBe(0)
    expect(box.width).toBeGreaterThan(400)
    await expect.poll(async () => overlap(await layoutOf(component.getByTestId('panel-b')), await layoutOf(a))).toBe(false)
  })

  test('pressing Shift mid-resize shows the outline at once, before the pointer moves again', async ({ mount, page }) => {
    const component = await mount(<CanvasHarness panels={[A, B]} />)
    const a = component.getByTestId('panel-a')
    await a.hover()
    const handle = (await a.getByTestId('resize-handle-e').boundingBox())!
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + 143, handle.y + handle.height / 2, { steps: 8 })
    await expect(component.getByTestId('snap-outline')).toHaveCount(0)
    await page.keyboard.down('Shift')
    await expect(component.getByTestId('snap-outline')).toBeVisible()
    await expect(component.getByTestId('snap-outline-nudge')).toHaveAttribute('data-panel-for', 'b')
    await page.keyboard.up('Shift')
    await expect(component.getByTestId('snap-outline')).toHaveCount(0)
    await page.mouse.up()
  })

  test('a Shift drop keeps the gap from the canvas edge', async ({ mount, page }) => {
    const component = await mount(<CanvasHarness panels={[{ ...A, pos_x: 200, pos_y: 200 }]} />)
    const a = component.getByTestId('panel-a')
    await page.keyboard.down('Shift')
    await startDrag(page, a, -400, -400)
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await expect.poll(() => layoutOf(a)).toMatchObject({ x: 20, y: 20 })
  })

  test('with reduced motion, a nudged widget is put straight down where it lands', async ({ mount, page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const component = await mount(<CanvasHarness panels={[A, B]} />)
    await page.keyboard.down('Shift')
    await startDrag(page, component.getByTestId('panel-a'), 393, 33)
    await page.mouse.up()
    await page.keyboard.up('Shift')
    const b = component.getByTestId('panel-b')
    // No glide: nothing draws it away from its box.
    expect(await b.evaluate((el) => getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
  })

  test("the drag handle's tooltip says how Shift places a widget", async ({ mount }) => {
    const component = await mount(<CanvasHarness panels={[A]} />)
    await expect(component.getByTestId('panel-a').getByTestId('panel-header')).toHaveAttribute('title', /Hold Shift to snap/)
  })
})
