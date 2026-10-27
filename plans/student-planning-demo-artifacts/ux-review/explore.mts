import { open, shot, home, board, OUT } from './lib.mts'
const { browser, page } = await open({ theme: 'light' })
try {
  await home(page)
  await board(page, 'My week')
  const top = page.getByTestId('top-bar')
  for (const name of ['Activity', 'Board appearance', 'Tidy up widgets']) {
    await top.getByRole('button', { name }).hover()
    await page.waitForTimeout(900)
    await shot(page, `explore-hover-${name.replace(/\W+/g, '_')}`)
    await top.getByRole('button', { name }).click()
    await page.waitForTimeout(900)
    await shot(page, `explore-click-${name.replace(/\W+/g, '_')}`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
  await top.getByTestId('scope-chip').click()
  await page.waitForTimeout(700)
  await shot(page, `explore-scope-chip-click`)
  await page.keyboard.press('Escape')
  // quick add a to-do
  const input = page.getByPlaceholder(/to-do/i).first()
  await input.click()
  await shot(page, `explore-todo-focus`)
  await input.fill('Read chapter 6 notes')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  await shot(page, `explore-todo-added`)
  // tick one done
  const firstCheck = page.getByRole('checkbox').first()
  if (await firstCheck.count()) { await firstCheck.click(); await page.waitForTimeout(1200); await shot(page, `explore-todo-ticked`) }
  // widget lightning (automations) on To-do
  await page.locator('[data-testid^="panel-automations-"]').first().click()
  await page.waitForTimeout(800)
  await shot(page, `explore-automations-calendar`)
  await page.keyboard.press('Escape')
} finally { await browser.close() }
