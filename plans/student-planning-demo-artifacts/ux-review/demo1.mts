import { open, shot, home } from './lib.mts'
const theme = (process.argv[2] ?? 'light') as 'light' | 'dark'
const p = `demo-${theme}`
const { browser, page } = await open({ theme })
try {
  await home(page)
  const top = page.getByTestId('top-bar')
  await top.getByRole('button', { name: 'New board' }).hover()
  await shot(page, `${p}-01a-newboard-hover`)
  await top.getByRole('button', { name: 'New board' }).click()
  await page.waitForTimeout(400)
  await shot(page, `${p}-01b-create-dialog`)
  const dlg = page.getByRole('dialog')
  await dlg.getByLabel('Name').fill('My week')
  await shot(page, `${p}-01c-create-dialog-filled`)
  await dlg.getByRole('button', { name: 'Create' }).click()
  await page.waitForTimeout(1200)
  await shot(page, `${p}-02-empty-board`)
  await top.getByTestId('drawer-trigger').click()
  await page.waitForTimeout(600)
  await shot(page, `${p}-03-drawer`)
  const drawer = page.getByTestId('drawer-sidebar')
  await drawer.screenshot({ path: `/private/tmp/claude-501/-Users-edward-barnes-glean-co-Code-Genio-playground-malleable-plc-poc/9f0cbd4c-0ede-44d9-98ef-b18f3c7d2260/scratchpad/t12/shots/${p}-03b-drawer-full.png` })
  for (const w of ['Calendar', 'To-do', 'Coming up']) {
    await page.locator('aside').getByRole('button', { name: `Add ${w}`, exact: true }).click()
    await page.waitForTimeout(700)
  }
  await shot(page, `${p}-04-added-with-drawer`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1500)
  await shot(page, `${p}-05-board-built`)
  // keyboard focus sample
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab')
  await shot(page, `${p}-05b-focus-tab3`)
} finally { await browser.close() }
