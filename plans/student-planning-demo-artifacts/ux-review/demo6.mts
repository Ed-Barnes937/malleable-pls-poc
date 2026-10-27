import { open, shot, home, board, OUT } from './lib.mts'
const theme = (process.argv[2] ?? 'light') as 'light' | 'dark'
const p = `demo-${theme}`
const { browser, page } = await open({ theme })
try {
  await home(page)
  await board(page, 'My week')
  await page.getByRole('button', { name: /^from: Mitochondrial DNA/ }).first().click()
  await page.waitForTimeout(1500)
  await shot(page, `${p}-26-todo-source-landed`)
  const transcript = page.locator('[data-testid^="panel-"]').filter({ has: page.getByTestId('panel-title').filter({ hasText: 'Transcript' }) }).first()
  await transcript.locator('[data-testid^="panel-automations-"]').click()
  await page.waitForTimeout(800)
  await shot(page, `${p}-27-automations-dialog`)
  const dialog = page.getByRole('dialog')
  await dialog.screenshot({ path: `${OUT}/${p}-27b-automations-dialog-crop.png` })
  const sentence = dialog.getByTestId('review-automation-sentence')
  await sentence.getByLabel('Review length in minutes').selectOption('30')
  await page.waitForTimeout(1500)
  await sentence.getByLabel('When the review should happen by').selectOption({ label: 'by tomorrow' })
  await page.waitForTimeout(2000)
  await dialog.screenshot({ path: `${OUT}/${p}-28-automation-edited.png` })
  console.log(await dialog.innerText())
  await dialog.getByRole('button', { name: /close/i }).first().click()
  await page.waitForTimeout(1500)
  await shot(page, `${p}-29-block-moved`)
  // drawer automations
  await page.getByTestId('top-bar').getByTestId('drawer-trigger').click()
  await page.waitForTimeout(600)
  await page.locator('aside').evaluate((el) => el.scrollTo(0, 9999))
  await page.waitForTimeout(300)
  await page.getByTestId('drawer-sidebar').screenshot({ path: `${OUT}/${p}-30-drawer-automations.png` })
  await page.keyboard.press('Escape')
  // top bar icons: activity and settings
  const icons = page.getByTestId('top-bar').getByRole('button')
  for (const n of await icons.all()) console.log('topbar btn', await n.getAttribute('aria-label'), (await n.innerText()).trim())
} finally { await browser.close() }
