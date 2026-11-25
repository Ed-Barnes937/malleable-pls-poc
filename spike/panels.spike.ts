// Throwaway spike assertions for K0 spike 3 (board panels on createMove/createResize).
// Runs against the app on API 3183 / web 5283, DB malleable_pls_k0s3.
// SPIKE=0 runs the baseline (today's code): keyboard tests skip.
import { test, expect, type Page, type Locator } from '@playwright/test'
import { reseed } from '/Users/edward.barnes@glean.co/Code/Worktrees/malleable-plc-poc/k0-spike-panels/e2e/reseed'
import { execSync } from 'node:child_process'

const SPIKE = process.env.SPIKE !== '0'
const SHOTS = '/private/tmp/claude-501/-Users-edward-barnes-glean-co-Code-Worktrees-malleable-plc-poc-ui-sdk/936cf541-3eaf-4443-b7a9-2838f29d8bd3/scratchpad/panels/shots'
const tag = SPIKE ? 'spike' : 'baseline'

type Box = { x: number; y: number; w: number; h: number; z: number }

async function box(panel: Locator): Promise<Box> {
  return panel.evaluate((el) => {
    const s = getComputedStyle(el)
    return { x: parseFloat(s.left), y: parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height), z: Number(s.zIndex) || 0 }
  })
}

function countPersists(page: Page) {
  const counter = { n: 0, bodies: [] as string[] }
  page.on('request', (r) => {
    if (r.url().includes('updateLayouts')) {
      counter.n++
      counter.bodies.push(r.postData() ?? '')
    }
  })
  return counter
}

const layoutCalls = (page: Page) => page.evaluate(() => (window as unknown as { __layoutChanges?: number }).__layoutChanges ?? 0)

async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(400)
}

async function open(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('canvas-container')).toBeVisible()
  await expect(page.locator('[data-panel-id]').first()).toBeVisible()
  await settle(page)
}

/** The first panel, pressed once so it's on top and selected (that press may persist z-order). */
async function topPanel(page: Page): Promise<Locator> {
  const panel = page.locator('[data-panel-id]').first()
  await panel.getByTestId('panel-title').click()
  await settle(page)
  return panel
}

async function drag(page: Page, from: Locator, dx: number, dy: number, opts: { shift?: boolean; escape?: boolean; midShot?: string } = {}) {
  const b = (await from.boundingBox())!
  const sx = b.x + Math.min(b.width / 2, 40)
  const sy = b.y + b.height / 2
  await page.mouse.move(sx, sy)
  if (opts.shift) await page.keyboard.down('Shift')
  await page.mouse.down()
  await page.mouse.move(sx + dx / 2, sy + dy / 2, { steps: 8 })
  await page.mouse.move(sx + dx, sy + dy, { steps: 8 })
  if (opts.midShot) await page.screenshot({ path: `${SHOTS}/${tag}-${opts.midShot}.png` })
  if (opts.escape) await page.keyboard.press('Escape')
  await page.mouse.up()
  if (opts.shift) await page.keyboard.up('Shift')
  await settle(page)
}

test.beforeEach(async () => {
  await reseed()
})

test.describe('desktop @desktop', () => {
  test('Q1 pointer move follows the pointer exactly, persists once', async ({ page }) => {
    await open(page)
    const panel = await topPanel(page)
    const persists = countPersists(page)
    const before = await box(panel)
    await drag(page, panel.getByTestId('panel-header'), 103, 57)
    const after = await box(panel)
    console.log(`[${tag}] move: ${JSON.stringify(before)} -> ${JSON.stringify(after)}, persists=${persists.n}`)
    expect(after.x - before.x).toBe(103)
    expect(after.y - before.y).toBe(57)
    expect(persists.n).toBe(1)
  })

  test('Q1 Shift move snaps to the 20px grid', async ({ page }) => {
    await open(page)
    const panel = await topPanel(page)
    await drag(page, panel.getByTestId('panel-header'), 103, 57, { shift: true, midShot: 'shift-move-mid' })
    const after = await box(panel)
    console.log(`[${tag}] shift move -> ${JSON.stringify(after)}`)
    expect(after.x % 20).toBe(0)
    expect(after.y % 20).toBe(0)
  })

  test('Q1 move stays in the canvas bounds (today: clampToCanvas)', async ({ page }) => {
    await open(page)
    const panel = await topPanel(page)
    const header = panel.getByTestId('panel-header')
    const canvasW = await page.getByTestId('canvas-container').evaluate((el) => el.clientWidth)
    await drag(page, header, 6000, 0)
    const b = await box(panel)
    const vis = Math.min(100, b.w / 2, b.h / 2)
    console.log(`[${tag}] far right -> x=${b.x} (expected ${canvasW - vis})`)
    expect(b.x).toBe(canvasW - vis)
    await page.reload()
    await settle(page)
    await drag(page, page.locator('[data-panel-id]').first().getByTestId('panel-header'), -6000, -3000, { midShot: 'move-out-of-bounds-mid' })
    const a = await box(page.locator('[data-panel-id]').first())
    const visible = Math.min(100, a.w / 2, a.h / 2)
    console.log(`[${tag}] far up-left -> ${JSON.stringify(a)} (expected x=${visible - a.w}, y=0)`)
    expect(a.x).toBe(visible - a.w)
    expect(a.y).toBe(0)
  })

  test('Q1 pointer resize (se, nw), min clamp, persists once', async ({ page }) => {
    await open(page)
    const panel = await topPanel(page)
    const persists = countPersists(page)
    const before = await box(panel)
    await panel.hover()
    await drag(page, panel.getByTestId('resize-handle-se'), 57, 33)
    const se = await box(panel)
    console.log(`[${tag}] resize se ${JSON.stringify(before)} -> ${JSON.stringify(se)}, persists=${persists.n}`)
    expect(se.w - before.w).toBe(57)
    expect(se.h - before.h).toBe(33)
    expect(se.x).toBe(before.x)
    expect(persists.n).toBe(1)

    await panel.hover()
    await drag(page, panel.getByTestId('resize-handle-nw'), -21, -13)
    const nw = await box(panel)
    console.log(`[${tag}] resize nw -> ${JSON.stringify(nw)}`)
    expect(nw.x + nw.w).toBe(se.x + se.w) // right edge anchored
    expect(nw.y + nw.h).toBe(se.y + se.h) // bottom edge anchored
    expect(nw.w - se.w).toBe(21)

  })

  test('Q1 resize clamps to the widget minimum', async ({ page }) => {
    await open(page)
    const panel = await topPanel(page)
    await panel.hover()
    await drag(page, panel.getByTestId('resize-handle-se'), -450, -400, { midShot: 'resize-min-mid' })
    const min = await box(panel)
    console.log(`[${tag}] resize to min -> ${JSON.stringify(min)}`)
    // Transcript's manifest minimum is 300 x 250.
    expect(min).toMatchObject({ x: 40, y: 40, w: 300, h: 250 })
  })

  test('debug: resizes in a row', async ({ page }) => {
    await open(page)
    const panel = await topPanel(page)
    for (const [h, dx, dy] of [['se', 57, 33], ['nw', -21, -13], ['se', -450, -400], ['nw', 10, 10], ['se', 5, 5]] as const) {
      await panel.hover()
      const hb = (await panel.getByTestId(`resize-handle-${h}`).boundingBox())!
      const hit = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y) as HTMLElement; return el?.dataset.testid ?? el?.tagName }, { x: hb.x + Math.min(hb.width / 2, 40), y: hb.y + hb.height / 2 })
      await drag(page, panel.getByTestId(`resize-handle-${h}`), dx, dy)
      console.log(`[${tag}] ${h} ${dx},${dy} (press hits ${hit}) -> ${JSON.stringify(await box(panel))}`)
    }
  })

  test('Q1 Shift resize snaps to the grid (and does it lock aspect?)', async ({ page }) => {
    await open(page)
    const panel = await topPanel(page)
    const before = await box(panel)
    await panel.hover()
    await drag(page, panel.getByTestId('resize-handle-se'), 97, 13, { shift: true })
    const after = await box(panel)
    console.log(`[${tag}] shift resize ${JSON.stringify(before)} -> ${JSON.stringify(after)}; ratio before ${(before.w / before.h).toFixed(3)} after ${(after.w / after.h).toFixed(3)}`)
    expect(after.w % 20).toBe(0)
    expect(after.h % 20).toBe(0)
  })

  test('Q5 Escape during a drag puts it back and persists nothing', async ({ page }) => {
    test.skip(!SPIKE, 'today has no Escape-cancel')
    await open(page)
    const panel = await topPanel(page)
    const persists = countPersists(page)
    const before = await box(panel)
    await drag(page, panel.getByTestId('panel-header'), 120, 80, { escape: true })
    await panel.hover()
    await drag(page, panel.getByTestId('resize-handle-se'), 120, 80, { escape: true })
    const after = await box(panel)
    const selected = await page.locator('[data-panel-id]').first().evaluate((el) => getComputedStyle(el).boxShadow)
    console.log(`[${tag}] escape: ${JSON.stringify(before)} -> ${JSON.stringify(after)}, persists=${persists.n}, shadow keeps selection ring: ${selected.includes('inset')}`)
    expect(after).toEqual(before)
    expect(persists.n).toBe(0)
    // Escape is swallowed by the drag (capture + stopPropagation), so the canvas
    // keyboard's Escape (clear selection) does not also run.
    expect(selected).toContain('inset')
  })

  test('Q1/Q5 keyboard move and resize, one persist per key', async ({ page }) => {
    test.skip(!SPIKE, 'no keyboard path today')
    await open(page)
    const panel = await topPanel(page)
    const persists = countPersists(page)
    const calls0 = await layoutCalls(page)
    const b0 = await box(panel)
    await page.keyboard.press('Alt+ArrowRight')
    await settle(page)
    const b1 = await box(panel)
    expect(b1.x - b0.x).toBe(1)
    expect(persists.n).toBe(1)
    await page.keyboard.press('Alt+Shift+ArrowDown')
    await settle(page)
    const b2 = await box(panel)
    console.log(`[${tag}] Alt+Right ${b0.x}->${b1.x}; Alt+Shift+Down ${b1.y}->${b2.y}; persists=${persists.n}`)
    expect(b2.y % 20).toBe(0)
    expect(b2.y).toBeGreaterThan(b1.y)
    expect(persists.n).toBe(2)

    // Resize handles are focusable buttons; plain arrows move their edge.
    const se = panel.getByRole('button', { name: /resize .* bottom right/i })
    await se.focus()
    await page.screenshot({ path: `${SHOTS}/${tag}-handle-focused.png` })
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowDown')
    await settle(page)
    const b3 = await box(panel)
    const calls = (await layoutCalls(page)) - calls0
    console.log(`[${tag}] handle keys: ${JSON.stringify(b2)} -> ${JSON.stringify(b3)}; http persists=${persists.n}, onLayoutChange calls=${calls}`)
    expect(b3.w - b2.w).toBe(1)
    expect(b3.h % 20).toBe(0)
    expect(calls).toBe(4)
    // An edge handle ignores the cross axis.
    const e = panel.getByTestId('resize-handle-e')
    await e.focus()
    await page.keyboard.press('ArrowDown')
    await settle(page)
    expect(await box(panel)).toEqual(b3)
    expect((await layoutCalls(page)) - calls0).toBe(4)
  })

  test('Q1 existing canvas shortcuts still work; Alt+arrow in a text field stays with the field', async ({ page }) => {
    test.skip(!SPIKE, 'no keyboard path today')
    await open(page)
    const panel = await topPanel(page)
    const b0 = await box(panel)
    // ] cycles selection, f fullscreens, Escape exits.
    await page.keyboard.press(']')
    await page.keyboard.press('[')
    await page.keyboard.press('f')
    await settle(page)
    expect((await box(panel)).w).toBeGreaterThan(b0.w)
    await page.keyboard.press('Escape')
    await settle(page)
    expect(await box(panel)).toMatchObject({ x: b0.x, y: b0.y, w: b0.w, h: b0.h })
    // Alt+arrow typed in a field inside a widget must not move the widget.
    const fieldSel = 'input[type="text"]:visible:enabled, textarea:visible:enabled, input[type="search"]:visible:enabled'
    const host = page.locator('[data-panel-id]').filter({ has: page.locator(fieldSel) }).first()
    const field = host.locator(fieldSel).first()
    if (await host.count()) {
      await host.getByTestId('panel-title').click()
      const h0 = await box(host)
      await field.click()
      await field.fill('hello world')
      await page.keyboard.press('Alt+ArrowLeft')
      await settle(page)
      console.log(`[${tag}] Alt+Left in a field: panel ${h0.x} -> ${(await box(host)).x}`)
      expect((await box(host)).x).toBe(h0.x)
    } else {
      console.log(`[${tag}] no text field on the opening board; Alt+arrow-in-field check not run`)
    }
  })

  test('Q4 pressing a panel brings it to front', async ({ page }) => {
    // Seeded panels all have z_index 0, and bringToFront is a no-op when the pressed
    // panel already has the max z, so give one panel z 1 first to make it observable.
    execSync(`docker exec malleable-plc-poc-postgres-1 psql -U pls -d malleable_pls_k0s3 -c "update workspace_panels set z_index = 1 where lens_type = 'test-me' and workspace_id = (select id from workspaces where name = 'Evening Review')"`)
    await open(page)
    const panels = page.locator('[data-panel-id]')
    const zs = await panels.evaluateAll((els) => els.map((el) => Number(getComputedStyle(el).zIndex)))
    const lowest = zs.indexOf(Math.min(...zs))
    const target = panels.nth(lowest)
    // Press its header, the body and a resize handle in turn: each brings it to front.
    await target.getByTestId('panel-content').click({ position: { x: 5, y: 5 } })
    await settle(page)
    const after = await panels.evaluateAll((els) => els.map((el) => Number(getComputedStyle(el).zIndex)))
    console.log(`[${tag}] z before ${zs} after ${after}`)
    expect(after[lowest]).toBe(Math.max(...after))
    expect(after.filter((z) => z === after[lowest]).length).toBe(1)
  })

  test('Q3 fullscreen panel cannot be moved or resized', async ({ page }) => {
    await open(page)
    const panel = await topPanel(page)
    await panel.getByRole('button', { name: /^Fullscreen/ }).click()
    await settle(page)
    const persists = countPersists(page)
    const full = await box(panel)
    await drag(page, panel.getByTestId('panel-header'), 120, 80)
    const handles = await panel.getByTestId('resize-handle-se').count()
    console.log(`[${tag}] fullscreen resize handles rendered: ${handles}`)
    if (handles) await drag(page, panel.getByTestId('resize-handle-se'), -120, -80)
    if (SPIKE) {
      await page.keyboard.press('Alt+ArrowRight')
      await settle(page)
    }
    const after = await box(panel)
    console.log(`[${tag}] fullscreen ${JSON.stringify(full)} -> ${JSON.stringify(after)}, persists=${persists.n}`)
    expect(after).toEqual(full)
    expect(persists.n).toBe(0)
    await page.screenshot({ path: `${SHOTS}/${tag}-fullscreen.png` })
    await panel.getByRole('button', { name: /^Exit fullscreen/ }).click()
    await settle(page)
  })

  test('Q6 drawer -> board native drop still adds a widget', async ({ page }) => {
    await open(page)
    const panels = page.locator('[data-panel-id]')
    const n = await panels.count()
    await page.getByTestId('drawer-trigger').click()
    await expect(page.getByTestId('drawer-sidebar')).toBeVisible()
    const tile = page.locator('aside [draggable="true"]').first()
    const name = await tile.getAttribute('data-lens-type')
    // Synthetic HTML5 drag events through the real handlers (DrawerSidebar dragstart ->
    // canvas dragover/drop). Playwright's mouse-driven native drag did not fire here, on
    // today's code either.
    await tile.evaluate((el) => {
      const dt = new DataTransfer()
      el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
      ;(window as unknown as { __dt: DataTransfer }).__dt = dt
    })
    await expect(page.getByTestId('drawer-backdrop')).toHaveCount(0)
    const accepted = await page.getByTestId('canvas-container').evaluate((canvas) => {
      const dt = (window as unknown as { __dt: DataTransfer }).__dt
      const r = canvas.getBoundingClientRect()
      const at = { clientX: r.left + 1000, clientY: r.top + 650 }
      const target = document.elementFromPoint(at.clientX, at.clientY) ?? canvas
      const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, ...at })
      target.dispatchEvent(over)
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, ...at }))
      return { dragoverAccepted: over.defaultPrevented, target: (target as HTMLElement).dataset.testid ?? target.tagName }
    })
    console.log(`[${tag}] drop target ${JSON.stringify(accepted)}`)
    await expect(panels).toHaveCount(n + 1)
    await settle(page)
    await page.screenshot({ path: `${SHOTS}/${tag}-drawer-drop.png` })
    console.log(`[${tag}] dropped ${name}: ${n} -> ${await panels.count()} panels`)
  })

  test('Q2 narrow canvas (400px): stacked, no move or resize', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 860 })
    await open(page)
    await expect(page.getByTestId('canvas-container')).toHaveAttribute('data-layout', 'stack')
    const panel = page.locator('[data-panel-id]').first()
    const persists = countPersists(page)
    const before = await panel.boundingBox()
    await drag(page, panel.getByTestId('panel-header'), 60, 40)
    if (SPIKE) {
      await panel.getByTestId('panel-title').click()
      await page.keyboard.press('Alt+ArrowRight')
      await settle(page)
    }
    const after = await panel.boundingBox()
    const handlesFocusable = await panel.locator('button[data-resize-handle]').count()
    console.log(`[${tag}] narrow ${JSON.stringify(before)} -> ${JSON.stringify(after)}, persists=${persists.n}, handle buttons=${handlesFocusable}`)
    expect(after).toEqual(before)
    expect(persists.n).toBe(0)
    expect(handlesFocusable).toBe(0)
    await page.screenshot({ path: `${SHOTS}/${tag}-narrow.png` })
  })
})

test.describe('phone @phone', () => {
  test('Q2 phone: stacked, header swipe does not move the panel, board still scrolls', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('canvas-container')).toHaveAttribute('data-layout', 'stack')
    const panel = page.locator('[data-panel-id]').nth(1)
    const persists = countPersists(page)
    const before = await panel.boundingBox()
    const content = page.locator('[data-panel-id]').first().getByTestId('panel-content')
    const cb = (await content.boundingBox())!
    // Swipe up on panel content: the stacked board should scroll.
    const scrolled = await page.evaluate(async ({ x, y }) => {
      const canvas = document.querySelector('[data-testid="canvas-container"]') as HTMLElement
      return { top: canvas.scrollTop, x, y }
    }, { x: cb.x, y: cb.y })
    const cdp = page.context().browser()?.browserType().name() === 'chromium' ? await page.context().newCDPSession(page) : null
    if (cdp) {
      await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(cb.x + 40), y: Math.round(Math.min(cb.y + 80, 600)), yDistance: -300, gestureSourceType: 'touch' })
      await page.waitForTimeout(500)
      const top = await page.getByTestId('canvas-container').evaluate((el) => el.scrollTop)
      console.log(`[${tag}] phone touch scroll: ${scrolled.top} -> ${top}`)
      // Log only: touch scrolling is spike 2's question; this synthetic gesture was not reliable.
    }
    // Tap the header: no movement, nothing persisted beyond z-order.
    await panel.getByTestId('panel-title').tap()
    await settle(page)
    const after = await panel.boundingBox()
    console.log(`[${tag}] phone tap ${JSON.stringify(before)} -> ${JSON.stringify(after)}, persists=${persists.n}, handle buttons=${await page.locator('button[data-resize-handle]').count()}`)
    expect(await page.locator('button[data-resize-handle]').count()).toBe(0)
    await page.screenshot({ path: `${SHOTS}/${tag}-phone-${page.context().browser()?.browserType().name()}.png` })
  })
})
