import { test, expect } from '../../../playwright/fixtures'
import { ToastHarness } from './ToastHarness'

// The harness's ShellProviders load the boards and courses: the simulated backend answers them.
test.beforeEach(async ({ simulator }) => { void simulator })

test('shows a toast and removes it after its time', async ({ mount, page }) => {
  await mount(<ToastHarness durationMs={700} />)
  await page.getByRole('button', { name: 'Add plain' }).click()
  await expect(page.getByTestId('toast')).toContainText('Transcript added')
  await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 3000 })
})

test('an action runs and closes the toast', async ({ mount, page }) => {
  let ran = 0
  await mount(<ToastHarness onAction={() => { ran++ }} />)
  await page.getByRole('button', { name: 'Add with action' }).click()
  await page.getByRole('button', { name: 'Back to My week' }).click()
  await expect(page.getByTestId('toast')).toHaveCount(0)
  expect(ran).toBe(1)
})

test('toasts sharing a key replace each other', async ({ mount, page }) => {
  await mount(<ToastHarness />)
  await page.getByRole('button', { name: 'Add keyed' }).click()
  await page.getByRole('button', { name: 'Add keyed' }).click()
  await expect(page.getByTestId('toast')).toHaveCount(1)
})

test('dismissing a key removes the toast with that key, leaving the others', async ({ mount, page }) => {
  await mount(<ToastHarness />)
  await page.getByRole('button', { name: 'Add marked and review' }).click()
  await expect(page.getByTestId('toast')).toHaveCount(2)
  await page.getByRole('button', { name: 'Dismiss marked' }).click()
  await expect(page.getByTestId('toast')).toHaveCount(1)
  await expect(page.getByTestId('toast')).toContainText('Review added to your plan')
})

test('dismissing a key drops a toast still waiting its turn', async ({ mount, page }) => {
  await mount(<ToastHarness />)
  await page.getByRole('button', { name: 'Add review, then marked, dismissed at once' }).click()
  await expect(page.getByTestId('toast')).toContainText('Review added to your plan')
  await page.waitForTimeout(500)
  await expect(page.getByTestId('toast')).toHaveCount(1)
  await expect(page.getByText('No longer marked confusing')).toHaveCount(0)
})

test('the countdown pauses while the pointer is on the toast, and resumes when it leaves', async ({ mount, page }) => {
  await mount(<ToastHarness durationMs={1200} />)
  await page.getByRole('button', { name: 'Add plain' }).click()
  await page.getByTestId('toast').hover()
  await page.waitForTimeout(2200)
  await expect(page.getByTestId('toast')).toHaveCount(1)
  await page.mouse.move(5, 5)
  await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 4000 })
})

test('the countdown pauses while focus is on the toast', async ({ mount, page }) => {
  await mount(<ToastHarness durationMs={1200} />)
  await page.getByRole('button', { name: 'Add plain' }).click()
  await page.keyboard.press('F6')
  await page.waitForTimeout(2200)
  await expect(page.getByTestId('toast')).toHaveCount(1)
})

test('F6 moves focus to the newest toast and back to where it was', async ({ mount, page }) => {
  await mount(<ToastHarness />)
  const add = page.getByRole('button', { name: 'Add plain' })
  await add.click()
  await expect(page.getByTestId('toast')).toHaveCount(1)
  await add.focus()
  await page.keyboard.press('F6')
  await expect(page.getByTestId('toast')).toBeFocused()
  await page.keyboard.press('F6')
  await expect(add).toBeFocused()
})

test('Escape on a focused toast dismisses it', async ({ mount, page }) => {
  await mount(<ToastHarness />)
  await page.getByRole('button', { name: 'Add plain' }).click()
  await page.keyboard.press('F6')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('toast')).toHaveCount(0)
})

test('the region is a landmark named Notifications that advertises F6', async ({ mount, page }) => {
  await mount(<ToastHarness />)
  await page.getByRole('button', { name: 'Add plain' }).click()
  await expect(page.getByRole('region', { name: 'Notifications' })).toHaveAttribute('aria-keyshortcuts', 'F6')
})

for (const theme of ['light', 'dark'] as const) {
  test(`a toast reads in ${theme} mode`, async ({ mount, page }) => {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await mount(<ToastHarness />)
    await page.getByRole('button', { name: 'Add with action' }).click()
    const toast = page.getByTestId('toast')
    await expect(toast).toBeVisible()
    const [bg, fg] = await toast.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
    expect(bg).not.toBe(fg)
  })
}

test.describe('how long a toast stays', () => {
  const cases = [
    { button: 'Add plain', stays: 3900, goes: 4100 },
    { button: 'Add with action', stays: 7900, goes: 8100 },
  ]
  for (const c of cases) {
    test(`${c.button}: still there at ${c.stays}ms, gone by ${c.goes}ms`, async ({ mount, page }) => {
      await page.clock.install()
      await mount(<ToastHarness />)
      await page.getByRole('button', { name: c.button }).click()
      await expect(page.getByTestId('toast')).toHaveCount(1)
      await page.clock.runFor(c.stays)
      await expect(page.getByTestId('toast')).toHaveCount(1)
      await page.clock.runFor(c.goes - c.stays)
      await expect(page.getByTestId('toast')).toHaveCount(0)
    })
  }

  test('with no duration it stays until dismissed', async ({ mount, page }) => {
    await page.clock.install()
    await mount(<ToastHarness />)
    await page.getByRole('button', { name: 'Add forever' }).click()
    await page.clock.runFor(120_000)
    await expect(page.getByTestId('toast')).toHaveCount(1)
    await page.getByTestId('toast').getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByTestId('toast')).toHaveCount(0)
  })
})

test('a board toast waiting its turn is dropped if the student leaves the board first', async ({ mount, page, simulator: _boards }) => {
  await mount(<ToastHarness />)
  await expect(page.getByRole('button', { name: 'Add board toast and leave' })).toBeEnabled()
  await page.getByRole('button', { name: 'Add board toast and leave' }).click()
  await expect(page.getByTestId('toast').filter({ hasText: 'Transcript added' })).toBeVisible()
  await page.waitForTimeout(600)
  await expect(page.getByTestId('toast').filter({ hasText: 'About this board' })).toHaveCount(0)
})

test('a board toast pushed right after switching to its board is shown', async ({ mount, page, simulator: _boards }) => {
  await mount(<ToastHarness />)
  await expect(page.getByRole('button', { name: 'Switch board and say so' })).toBeEnabled()
  await page.getByRole('button', { name: 'Switch board and say so' }).click()
  await expect(page.getByTestId('toast').filter({ hasText: 'Opened on the new board' })).toBeVisible()
})

test.describe('what a screen reader hears', () => {
  const announcer = (page: import('@playwright/test').Page) => page.locator('[data-ui-sdk-announcer=""]')

  test('a plain toast is announced as its message', async ({ mount, page }) => {
    await mount(<ToastHarness />)
    await page.getByRole('button', { name: 'Add plain' }).click()
    await expect(announcer(page)).toHaveText('Transcript added')
  })

  test('a toast with an action is announced as its message, then where the action is', async ({ mount, page }) => {
    await mount(<ToastHarness />)
    await page.getByRole('button', { name: 'Add with action' }).click()
    await expect(announcer(page)).toHaveText('Opened in In Lecture. Notifications has a Back to My week button.')
  })
})

test('after a hover the countdown resumes from the time that was left, not from the start', async ({ mount, page }) => {
  await page.clock.install()
  await mount(<ToastHarness />)
  await page.getByRole('button', { name: 'Add plain' }).click() // 4000ms
  await expect(page.getByTestId('toast')).toHaveCount(1)
  await page.clock.runFor(3000)
  await page.getByTestId('toast').hover()
  await page.clock.runFor(10000) // held: nothing counts down
  await expect(page.getByTestId('toast')).toHaveCount(1)
  await page.mouse.move(0, 0)
  await page.clock.runFor(500)
  await expect(page.getByTestId('toast')).toHaveCount(1)
  // About 1000ms were left: gone well before another full 4000ms.
  await page.clock.runFor(1000)
  await expect(page.getByTestId('toast')).toHaveCount(0)
})
