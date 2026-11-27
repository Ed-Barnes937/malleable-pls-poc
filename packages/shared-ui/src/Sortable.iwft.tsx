import { test, expect } from '../../../playwright/fixtures'
import type { Page } from '@playwright/test'
import { SortableHarness } from './SortableHarness'
import { THEMES, setTheme, tokenColor } from './ct-themes'

const order = (page: Page) => page.getByTestId('tab').allTextContents()
const commits = async (page: Page) => Number(await page.getByTestId('commits').textContent())

for (const theme of THEMES) {
  test.describe(`in ${theme}`, () => {
    test('a mouse drag lifts the tab under the pointer, reorders live and commits once on drop', async ({ mount, page }) => {
      await mount(<SortableHarness />)
      await setTheme(page, theme)
      const maths = page.getByRole('button', { name: 'Maths' })
      const box = (await maths.boundingBox())!
      const last = (await page.getByRole('button', { name: 'Biology' }).boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(last.x + last.width - 4, box.y + box.height / 2, { steps: 10 })
      // Held: the item lifts and follows the pointer, nothing is committed yet.
      const held = page.getByTestId('tab').filter({ has: maths })
      await expect(held).toHaveAttribute('data-dragging', '')
      await expect(held).toHaveCSS('z-index', '10')
      expect(await order(page)).toEqual(['Physics', 'Chemistry', 'Biology', 'Maths'])
      expect(await commits(page)).toBe(0)
      await page.mouse.up()
      await expect.poll(() => commits(page)).toBe(1)
      expect(await order(page)).toEqual(['Physics', 'Chemistry', 'Biology', 'Maths'])
      await expect(held).not.toHaveAttribute('data-dragging', '')
      await expect(page.getByTestId('tab').first()).toHaveCSS('background-color', await tokenColor(page, '--color-surface-raised'))
    })

    test('keyboard: Space, arrows, Space moves a tab; Escape puts it back', async ({ mount, page }) => {
      await mount(<SortableHarness />)
      await setTheme(page, theme)
      await page.getByRole('button', { name: 'Physics' }).focus()
      await page.keyboard.press('Space')
      await page.keyboard.press('ArrowRight')
      await expect(page.getByTestId('tab').filter({ hasText: 'Physics' })).toHaveAttribute('data-moving', '')
      await page.keyboard.press('Escape')
      expect(await order(page)).toEqual(['Maths', 'Physics', 'Chemistry', 'Biology'])
      expect(await commits(page)).toBe(0)
      await page.keyboard.press('Space')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Space')
      await expect.poll(() => order(page)).toEqual(['Maths', 'Chemistry', 'Physics', 'Biology'])
      expect(await commits(page)).toBe(1)
      await expect(page.getByRole('button', { name: 'Physics' })).toBeFocused()
    })
  })
}
