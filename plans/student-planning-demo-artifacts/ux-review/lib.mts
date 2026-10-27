import { chromium, type Page } from '/Users/edward.barnes@glean.co/Code/Genio/playground/malleable-plc-poc/.claude/worktrees/agent-a50c51f6d8d1d2002/node_modules/@playwright/test/index.mjs'
export const WEB = 'http://localhost:5315'
export const API = 'http://localhost:3215'
export const OUT = '/private/tmp/claude-501/-Users-edward-barnes-glean-co-Code-Genio-playground-malleable-plc-poc/9f0cbd4c-0ede-44d9-98ef-b18f3c7d2260/scratchpad/t12/shots'
export async function open(opts: { theme?: 'light' | 'dark'; width?: number; height?: number } = {}) {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
  const theme = opts.theme ?? 'light'
  const context = await browser.newContext({
    viewport: { width: opts.width ?? 1440, height: opts.height ?? 900 },
    permissions: ['microphone'], timezoneId: 'Europe/London', colorScheme: theme,
  })
  await context.addInitScript((t) => { try { localStorage.setItem('pls-theme', t) } catch {} }, theme)
  const page = await context.newPage()
  await page.clock.setFixedTime(new Date('2026-10-27T10:30:00Z'))
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  return { browser, page }
}
export async function shot(page: Page, name: string, full = false) {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full })
  console.log('shot', name)
}
export async function board(page: Page, name: string) {
  await page.getByTestId('top-bar').getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(1500)
}
export async function home(page: Page) {
  await page.goto(WEB)
  await page.getByTestId('top-bar').waitFor()
  await page.waitForTimeout(1500)
}
