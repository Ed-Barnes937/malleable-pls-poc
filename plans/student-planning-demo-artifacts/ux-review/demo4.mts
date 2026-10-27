import { open, shot, home, board, OUT } from './lib.mts'
const theme = (process.argv[2] ?? 'light') as 'light' | 'dark'
const p = `demo-${theme}`
const WAV = '/Users/edward.barnes@glean.co/Code/Genio/playground/malleable-plc-poc/.claude/worktrees/agent-a50c51f6d8d1d2002/demo/lecture-mitochondrial-dna.wav'
const { browser, page } = await open({ theme })
try {
  await home(page)
  await board(page, 'In Lecture')
  const audio = page.locator('[data-testid^="panel-"]').filter({ hasText: 'Audio Capture' }).first()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload a recording' }).click()
  await (await chooser).setFiles(WAV)
  await page.waitForTimeout(700)
  await shot(page, `${p}-16-upload-form`)
  const form = page.getByRole('form', { name: 'Upload a recording' })
  await form.getByRole('textbox', { name: 'Recording title' }).fill('Mitochondrial DNA')
  await form.getByRole('combobox', { name: 'Recording course' }).selectOption({ label: 'Biology' })
  await shot(page, `${p}-16b-upload-form-filled`)
  await form.getByRole('button', { name: 'Upload' }).click()
  for (const t of [1500, 4000, 8000]) {
    await page.waitForTimeout(t)
    await shot(page, `${p}-17-processing-${t}`)
  }
  await page.waitForTimeout(8000)
  await shot(page, `${p}-18-summary`)
  const moment = page.getByText(/let me try to explain maternal inheritance/).first()
  await moment.scrollIntoViewIfNeeded()
  await moment.click()
  await page.waitForTimeout(600)
  await shot(page, `${p}-19-moment-selected`)
  await page.getByRole('button', { name: 'confused', exact: true }).first().click()
  for (const t of [500, 1500, 4000]) {
    await page.waitForTimeout(t)
    await shot(page, `${p}-20-confused-${t}`)
  }
  await page.waitForTimeout(6000)
  await shot(page, `${p}-21-review-chip`)
  const chip = page.getByTestId('review-chip')
  console.log('chip', await chip.count() ? await chip.innerText() : 'none')
} finally { await browser.close() }
