import { open, shot, home, board, OUT } from './lib.mts'
const theme = (process.argv[2] ?? 'light') as 'light' | 'dark'
const p = `demo-${theme}`
const { browser, page } = await open({ theme })
try {
  await home(page)
  await board(page, 'My week')
  await shot(page, `${p}-22-myweek-with-review`)
  const cal = page.getByTestId('calendar')
  const blk = cal.getByTestId('calendar-block').filter({ hasText: 'Review' })
  console.log('review blocks', await blk.count(), await blk.first().getAttribute('aria-label'))
  await blk.first().hover()
  await shot(page, `${p}-22b-hover-review`)
  await blk.first().click()
  await page.waitForTimeout(1000)
  await shot(page, `${p}-23-click-review`)
  // todo list source link
  const todo = page.locator('[data-testid^="panel-"]').filter({ hasText: 'To-do' })
  // add Transcript to the board to land on the moment
  await page.keyboard.press('Escape')
  await page.getByTestId('top-bar').getByTestId('drawer-trigger').click()
  await page.waitForTimeout(500)
  await page.locator('aside').getByRole('button', { name: 'Add Transcript', exact: true }).click()
  await page.waitForTimeout(800)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1500)
  await shot(page, `${p}-24-with-transcript`)
  await cal.getByTestId('calendar-block').filter({ hasText: 'Review' }).first().click()
  await page.waitForTimeout(1500)
  await shot(page, `${p}-25-landed-on-moment`)
  const go = page.getByRole('button', { name: /transcript|moment|open/i })
  console.log('buttons', await page.getByTestId('calendar-popover').count() ? await page.getByTestId('calendar-popover').innerText() : 'no popover')
} finally { await browser.close() }
