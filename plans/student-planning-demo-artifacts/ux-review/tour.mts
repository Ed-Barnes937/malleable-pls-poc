import { open, shot, board, home } from './lib.mts'
for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 400]) {
    const { browser, page } = await open({ theme, width, height: width === 400 ? 860 : 900 })
    await home(page)
    await shot(page, `tour-${theme}-${width}-00-landing`, width === 400)
    const tabs = (await page.getByTestId('workspace-tab').allTextContents()).map((t) => t.trim()).filter(Boolean)
    console.log('tabs', tabs)
    for (const n of tabs) {
      try { await board(page, n) } catch { console.log('fail', n) }
      await shot(page, `tour-${theme}-${width}-${n.replace(/\W+/g, '_')}`, width === 400)
    }
    await browser.close()
  }
}
