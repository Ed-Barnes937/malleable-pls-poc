// Minimal browser-verification helper (see e2e/README.md, "Browser
// verification"). Boot the stack first, then either run it as a CLI:
//
//   API_PORT=3105 WEB_PORT=5205 node scripts/browse.mts --board "In Lecture" --out /tmp/shot.png
//
// or import the helpers into a throwaway Playwright script:
//
//   import { bootCheck, launch, openBoard, screenshot } from '<repo>/scripts/browse.mts'
//
// Runs with plain `node` (Node 24 strips the types), so keep the syntax erasable.
import { chromium, type Browser, type Page } from '@playwright/test'
import { parseArgs } from 'node:util'

export const apiUrl = `http://localhost:${process.env.API_PORT ?? '3001'}`
export const webUrl = `http://localhost:${process.env.WEB_PORT ?? '5173'}`

/** Throws unless both the API (/health) and the web app answer. */
export async function bootCheck(): Promise<void> {
  for (const url of [`${apiUrl}/health`, webUrl]) {
    let res: Response
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    } catch (err) {
      throw new Error(`${url} is not reachable - is the stack running? (${(err as Error).message})`)
    }
    if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  }
}

/**
 * Headless Chromium at 1440x900 with a fake microphone, so audio capture can
 * be driven without a device or permission prompt.
 */
export async function launch(): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] })
  const page = await context.newPage()
  return { browser, page }
}

/** Opens the app and, if given, switches to the board (workspace tab) with that name. */
export async function openBoard(page: Page, board?: string): Promise<void> {
  await page.goto(webUrl)
  const topBar = page.getByTestId('top-bar')
  await topBar.waitFor()
  if (board) {
    const tab = topBar.getByRole('button', { name: board, exact: true })
    await tab.click()
    await page.waitForFunction(
      (name) => [...document.querySelectorAll('[aria-current="page"]')].some((el) => el.textContent?.trim() === name),
      board,
    )
  }
  await page.waitForLoadState('networkidle')
}

export async function screenshot(page: Page, path: string): Promise<void> {
  await page.screenshot({ path, fullPage: true })
  console.log(`screenshot: ${path}`)
}

async function main() {
  const { values } = parseArgs({
    options: {
      board: { type: 'string' },
      out: { type: 'string', default: 'browse.png' },
    },
  })
  await bootCheck()
  const { browser, page } = await launch()
  try {
    await openBoard(page, values.board)
    await screenshot(page, values.out!)
  } finally {
    await browser.close()
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
