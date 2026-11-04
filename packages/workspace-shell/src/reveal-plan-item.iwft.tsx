import { test, expect } from '../../../playwright/fixtures'
import { RevealPlanItemHarness } from '../../../playwright/reveal-plan-item-harness'
import { seedPlanItem } from '../../../playwright/plan-items'
import { watchConsole } from '../../../playwright/console-guard'

// "See it" on a toast that may have outlived its plan item (e.g. its lecture was deleted).

test('shows a block that is still there', async ({ mount, page, simulator }) => {
  const console = watchConsole(page)
  seedPlanItem(simulator, { id: 'review-1', kind: 'task', title: 'Review: cells', starts_at: '2030-11-12T14:00:00Z', ends_at: '2030-11-12T14:30:00Z' })
  await mount(<RevealPlanItemHarness id="review-1" />)
  await page.getByRole('button', { name: 'See it' }).click()
  await expect(page.getByTestId('shown')).toHaveText('review-1')
  await expect(page.getByTestId('toast')).toHaveCount(0)
  expect(console.unexpected()).toEqual([])
})

test('a block that is gone shows nothing and says so, with no error', async ({ mount, page, simulator }) => {
  const console = watchConsole(page)
  seedPlanItem(simulator, { id: 'review-1', kind: 'task', title: 'Review: cells', starts_at: '2030-11-12T14:00:00Z', ends_at: '2030-11-12T14:30:00Z' })
  await mount(<RevealPlanItemHarness id="review-1" />)
  // Deleted after its toast appeared (its lecture went, say).
  simulator.db.planItems = simulator.db.planItems.filter((p) => p.id !== 'review-1')
  await page.getByRole('button', { name: 'See it' }).click()
  await expect(page.getByTestId('toast')).toHaveText('That study block was deleted')
  await expect(page.getByTestId('shown')).toHaveText('nothing')
  expect(console.unexpected()).toEqual([])
})

test('a lookup that fails says so and shows nothing', async ({ mount, page, simulator: _boards }) => {
  const console = watchConsole(page)
  // The refused lookup (500) is the point of this test.
  console.allow(/500/)
  await page.route((url) => url.pathname.split(/[/,]/).includes('planItems.byId'), (route) => route.fulfill({ status: 500, body: '{}' }))
  await mount(<RevealPlanItemHarness id="review-1" />)
  await page.getByRole('button', { name: 'See it' }).click()
  await expect(page.getByTestId('toast')).toHaveText("Couldn't find that study block - try again")
  await expect(page.getByTestId('shown')).toHaveText('nothing')
  expect(console.unexpected()).toEqual([])
})
