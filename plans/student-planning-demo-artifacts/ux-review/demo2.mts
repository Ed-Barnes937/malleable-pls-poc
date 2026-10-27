import { open, shot, home, board, OUT } from './lib.mts'
const theme = (process.argv[2] ?? 'light') as 'light' | 'dark'
const p = `demo-${theme}`
const { browser, page } = await open({ theme })
try {
  await home(page)
  await board(page, 'My week')
  const cal = page.getByTestId('calendar')
  await cal.getByTestId('help-me-plan').hover()
  await shot(page, `${p}-06a-hmp-hover`)
  await cal.getByTestId('help-me-plan').click()
  await page.waitForTimeout(1000)
  await shot(page, `${p}-06-help-me-plan`)
  const panel = cal.getByTestId('help-me-plan-panel')
  await panel.screenshot({ path: `${OUT}/${p}-06b-hmp-panel.png` })
  const sug = panel.getByTestId('plan-todo').first().getByTestId('plan-suggestion').first()
  console.log('suggestion text', await sug.textContent())
  await sug.click()
  await page.waitForTimeout(1000)
  await shot(page, `${p}-07-assigned-one`)
  await panel.getByTestId('autofill').click()
  await page.waitForTimeout(1500)
  await shot(page, `${p}-08-autofill-clicked`)
  const assume = panel.getByRole('button', { name: /Assume .* Auto-fill/ })
  if (await assume.count()) { await assume.click(); await page.waitForTimeout(1500); await shot(page, `${p}-08b-after-assume`) }
  const draft = panel.getByTestId('autofill-draft')
  await draft.waitFor({ timeout: 10000 })
  await shot(page, `${p}-09-ghost-draft`)
  await panel.screenshot({ path: `${OUT}/${p}-09b-draft-panel.png` })
  console.log('draft text', await draft.innerText())
  await draft.getByRole('button', { name: 'Accept all' }).click()
  await page.waitForTimeout(1500)
  await shot(page, `${p}-10-accepted`)
} finally { await browser.close() }
