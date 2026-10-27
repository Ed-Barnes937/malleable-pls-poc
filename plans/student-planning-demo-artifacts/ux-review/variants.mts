import { open, shot, home, board, OUT } from './lib.mts'
for (const [theme, width] of [['dark', 1440], ['light', 400], ['dark', 400]] as const) {
  const p = `var-${theme}-${width}`
  const { browser, page } = await open({ theme, width, height: width === 400 ? 860 : 900 })
  try {
    await home(page)
    await board(page, 'My week')
    await shot(page, `${p}-myweek`, width === 400)
    const cal = page.getByTestId('calendar')
    await cal.getByTestId('help-me-plan').scrollIntoViewIfNeeded()
    await cal.getByTestId('help-me-plan').click()
    await page.waitForTimeout(1200)
    await shot(page, `${p}-hmp`, false)
    await cal.getByTestId('help-me-plan').click().catch(() => {})
    await board(page, 'In Lecture')
    const m = page.getByText(/let me try to explain maternal inheritance/).first()
    await m.scrollIntoViewIfNeeded()
    await shot(page, `${p}-inlecture`, false)
    await board(page, 'Exam Prep')
    await shot(page, `${p}-examprep`, width === 400)
    if (width === 400) {
      await page.getByTestId('top-bar').getByTestId('drawer-trigger').click()
      await page.waitForTimeout(600)
      await shot(page, `${p}-drawer`)
      await page.keyboard.press('Escape')
      await page.getByTestId('top-bar').getByRole('button', { name: 'New board' }).click().catch((e) => console.log('newboard not clickable'))
      await page.waitForTimeout(600)
      await shot(page, `${p}-newboard`)
    }
  } finally { await browser.close() }
}
