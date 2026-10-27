import { open, shot, home, board, OUT } from './lib.mts'
const theme = (process.argv[2] ?? 'light') as 'light' | 'dark'
const p = `demo-${theme}`
const { browser, page } = await open({ theme })
try {
  await home(page)
  await board(page, 'My week')
  const cal = page.getByTestId('calendar')
  // drag a study block
  const blk = cal.getByTestId('calendar-block').filter({ hasText: 'Make flash' })
  const b = await blk.boundingBox()
  if (b) {
    await page.mouse.move(b.x + b.width / 2, b.y + 8)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2 + 150, b.y + 200, { steps: 10 })
    await shot(page, `${p}-11a-dragging`)
    await page.mouse.up()
    await page.waitForTimeout(1200)
    await shot(page, `${p}-11b-dropped`)
  }
  // click a commitment to see popover
  await cal.getByTestId('calendar-block').filter({ hasText: 'Cafe' }).first().click()
  await page.waitForTimeout(600)
  await shot(page, `${p}-12-commitment-popover`)
  await page.keyboard.press('Escape')
  // click empty time to create
  const grid = cal.getByTestId('calendar-grid')
  const gb = await grid.boundingBox()
  const day = await cal.getByTestId('calendar-day').nth(5).boundingBox()
  if (gb && day) {
    await page.mouse.click(day.x + day.width / 2, gb.y + (14 / 24) * gb.height)
    await page.waitForTimeout(700)
    await shot(page, `${p}-13-create-popover`)
    await page.keyboard.press('Escape')
  }
  // Scope to Biology via drawer
  await page.getByTestId('top-bar').getByTestId('drawer-trigger').click()
  await page.waitForTimeout(500)
  await page.locator('aside').getByTestId('scope-section').getByRole('combobox', { name: 'Course' }).selectOption({ label: 'Biology' })
  await page.waitForTimeout(800)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1500)
  await shot(page, `${p}-14-biology-scope`)
  // Evening review (biology board)
  await page.getByTestId('top-bar').getByRole('button', { name: 'Day', exact: true }).count()
  await cal.getByRole('button', { name: 'Day', exact: true }).click()
  await page.waitForTimeout(800)
  await shot(page, `${p}-15-day-view`)
  await cal.getByRole('button', { name: 'Week', exact: true }).click()
  // reset scope
  await page.getByTestId('top-bar').getByTestId('drawer-trigger').click()
  await page.waitForTimeout(500)
  await page.locator('aside').getByTestId('scope-section').getByRole('combobox', { name: 'Course' }).selectOption({ label: 'All courses' })
  await page.keyboard.press('Escape')
} finally { await browser.close() }
