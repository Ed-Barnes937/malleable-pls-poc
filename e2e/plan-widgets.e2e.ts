import { test, expect, type APIRequestContext } from '@playwright/test'
import { PanelGridPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { apiUrl } from './ports'

/**
 * To-do and Coming up are views over the same plan items: a to-do added on a
 * Biology board is filed under Biology and shows on every board whose scope
 * includes it.
 *
 * Boards are set up through the API (as the shell's drop handler does); the
 * to-do itself is added through the widget, as a student would.
 */

const headers = { 'x-user-id': 'dev-user-1' }

async function call<T>(request: APIRequestContext, procedure: string, input: unknown): Promise<T> {
  const res = await request.post(`${apiUrl}/${procedure}`, { headers, data: { json: input } })
  expect(res.ok(), `${procedure}: ${await res.text()}`).toBe(true)
  return (await res.json()).result.data.json as T
}

async function createBoard(request: APIRequestContext, name: string, course: string | null, lensTypes: string[]) {
  const board = await call<{ id: string }>(request, 'workspaces.create', { name })
  if (course) {
    await call(request, 'workspaces.setScope', { workspaceId: board.id, scopeType: 'tag', scopeValue: course })
  }
  for (const [i, lensType] of lensTypes.entries()) {
    await call(request, 'workspaces.addPanel', {
      workspaceId: board.id, lensType, slotName: `slot-${lensType}`,
      pos_x: 24 + i * 400, pos_y: 24, width: 380, height: 400, z_index: i + 1,
    })
  }
  return board
}

test.describe('Plan widgets: To-do and Coming up', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('a to-do added on a Biology board appears on an unscoped board', async ({ page, request }) => {
    await createBoard(request, 'Biology week', 'biology', ['todo', 'coming-up'])
    await createBoard(request, 'Everything', null, ['todo', 'coming-up'])
    // The deadlines are Priya's seeded week (e2e/seed-week.ts): a Biology quiz and a Chemistry lab report, both ahead.

    await page.goto('/')
    const topBar = new TopBarPom(page)
    const grid = new PanelGridPom(page)

    // Biology board: Coming up filters to Biology and says what it leaves out.
    await topBar.switchToWorkspace('Biology week')
    await expect(topBar.scopeChip).toHaveText('Showing: Biology', { timeout: 10000 })
    const comingUp = grid.panelByLabel('Coming up')
    await expect(comingUp.getByText('Biology quiz')).toBeVisible({ timeout: 10000 })
    await expect(comingUp.getByText('Chemistry lab report')).toHaveCount(0)
    await expect(comingUp.getByText('+1 in other courses')).toBeVisible()

    // Add a to-do with an estimate; it inherits the board course.
    const todo = grid.panelByLabel('To-do')
    await todo.getByRole('textbox', { name: 'New to-do' }).fill('Review enzymes')
    await todo.getByRole('combobox', { name: 'Time estimate' }).selectOption({ label: '30m' })
    await todo.getByRole('button', { name: 'Add to-do' }).click()
    await expect(todo.getByTestId('todo-item').filter({ hasText: 'Review enzymes' })).toBeVisible({ timeout: 10000 })

    // Unscoped board: the same to-do, labelled Biology, alongside every course's deadlines.
    await topBar.switchToWorkspace('Everything')
    const allTodo = grid.panelByLabel('To-do')
    const row = allTodo.getByTestId('todo-item').filter({ hasText: 'Review enzymes' })
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row.getByText('biology')).toBeVisible()
    await expect(row.getByText('30m')).toBeVisible()
    await expect(grid.panelByLabel('Coming up').getByText('Chemistry lab report')).toBeVisible()

    // Ticking it off on one board is reflected on the other.
    await row.getByRole('checkbox', { name: 'Done: Review enzymes' }).click()
    await expect(allTodo.getByText('Done today')).toBeVisible({ timeout: 10000 })
    await topBar.switchToWorkspace('Biology week')
    await expect(grid.panelByLabel('To-do').getByRole('checkbox', { name: 'Not done yet: Review enzymes' })).toBeVisible({ timeout: 10000 })
  })
})
