import { test, expect } from './test'
import { apiUrl } from './ports'

// The fonts come with the app (apps/web/src/fonts): nothing is fetched from
// another origin, and the text is in DM Sans even with Google Fonts out of reach.
test('the app draws its text in DM Sans with nothing fetched from another origin', async ({ page, baseURL }) => {
  const elsewhere: string[] = []
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (url.startsWith(`${baseURL}/`) || url.startsWith(`${apiUrl}/`)) return route.fallback()
    elsewhere.push(url)
    await route.abort()
  })
  await page.goto('/')
  await expect(page.getByTestId('top-bar')).toBeVisible()

  const fonts = await page.evaluate(async () => {
    await document.fonts.ready
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.style}`)
  })
  expect(fonts).toContain('DM Sans normal')
  expect(await page.evaluate(() => document.fonts.check('16px "DM Sans"'))).toBe(true)
  expect(elsewhere).toEqual([])
})
