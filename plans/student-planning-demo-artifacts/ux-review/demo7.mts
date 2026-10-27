import { open, shot, home, board, OUT, API } from './lib.mts'
const theme = (process.argv[2] ?? 'light') as 'light' | 'dark'
const p = `demo-${theme}`
const H = { 'x-user-id': 'dev-user-1', 'content-type': 'application/json' }
async function mut(path: string, input: unknown) {
  const r = await fetch(`${API}/${path}`, { method: 'POST', headers: H, body: JSON.stringify({ json: input }) })
  if (!r.ok) throw new Error(await r.text())
}
if (process.argv[3] === 'seed') {
  await mut('planItems.create', { kind: 'task', title: 'Read chapter 5', duration_min: 30, course: 'biology', starts_at: '2026-10-26T10:00:00Z', ends_at: '2026-10-26T10:30:00Z' })
  await mut('planItems.create', { kind: 'task', title: 'Lab write-up: method', duration_min: 60, course: 'chemistry', starts_at: '2026-10-26T18:00:00Z', ends_at: '2026-10-26T19:00:00Z' })
}
const { browser, page } = await open({ theme })
try {
  await home(page)
  await board(page, 'My week')
  await shot(page, `${p}-31-refit-banner`)
  const todo = page.locator('[data-testid^="panel-"]').filter({ has: page.getByTestId('panel-title').filter({ hasText: 'To-do' }) }).first()
  const banner = todo.getByTestId('refit-banner')
  if (await banner.count()) {
    await banner.getByRole('button', { name: 'Re-fit' }).click()
    await page.waitForTimeout(1500)
    await shot(page, `${p}-32-refit-preview`)
    await todo.screenshot({ path: `${OUT}/${p}-32b-refit-todo.png` })
  }
  // weak topics
  await board(page, 'Exam Prep')
  const weak = page.getByRole('button', { name: /^Maternal inheritance: go to this moment/ })
  await weak.hover()
  await shot(page, `${p}-33-weak-hover`)
  await weak.click()
  await page.waitForTimeout(1200)
  await shot(page, `${p}-34-weak-clicked`)
} finally { await browser.close() }
