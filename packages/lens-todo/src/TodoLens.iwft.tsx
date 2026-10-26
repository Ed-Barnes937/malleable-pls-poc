import { test, expect } from '../../../playwright/fixtures'
import { TestProviders } from '../../../playwright/mount-wrapper'
import { daysFromNow, seedPlanItem } from '../../../playwright/plan-items'
import TodoLens from './TodoLens'

const defaultProps = {
  panelId: 'test-panel',
  scope: {},
  config: {},
}

test('quick add on a Biology board files the to-do under Biology with its estimate', async ({ mount, page, simulator }) => {
  await mount(
    <TestProviders>
      <TodoLens {...defaultProps} scope={{ courseTag: 'biology' }} />
    </TestProviders>,
  )

  await expect(page.getByText('Nothing to do yet')).toBeVisible()
  await page.getByRole('textbox', { name: 'New to-do' }).fill('Review enzymes')
  await page.getByRole('combobox', { name: 'Time estimate' }).selectOption({ label: '30 min' })
  await page.getByRole('textbox', { name: 'New to-do' }).press('Enter')

  const row = page.getByTestId('todo-item').filter({ hasText: 'Review enzymes' })
  await expect(row).toBeVisible()
  await expect(row.getByText('30m')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'New to-do' })).toHaveValue('')

  const created = simulator.db.planItems.find((p) => p.title === 'Review enzymes')!
  expect(created).toMatchObject({ kind: 'task', duration_min: 30, status: 'open' })
  expect(simulator.db.tags.find((t) => t.target_type === 'plan_item' && t.target_id === created.id)?.label).toBe('biology')
})

test('a course-filtered board shows only its to-dos and says what it leaves out', async ({ mount, page, simulator }) => {
  seedPlanItem(simulator, { id: 'todo-bio', kind: 'task', title: 'Read chapter 4', course: 'biology' })
  seedPlanItem(simulator, { id: 'todo-chem', kind: 'task', title: 'Balance equations', course: 'chemistry' })

  await mount(
    <TestProviders>
      <TodoLens {...defaultProps} scope={{ courseTag: 'biology' }} />
    </TestProviders>,
  )

  await expect(page.getByText('Read chapter 4')).toBeVisible()
  await expect(page.getByText('Balance equations')).toHaveCount(0)
  await expect(page.getByText('+1 in other courses')).toBeVisible()
})

test('an unscoped board shows every course with its pill', async ({ mount, page, simulator }) => {
  seedPlanItem(simulator, { id: 'todo-bio', kind: 'task', title: 'Read chapter 4', course: 'biology' })
  seedPlanItem(simulator, { id: 'todo-chem', kind: 'task', title: 'Balance equations', course: 'chemistry' })

  await mount(
    <TestProviders>
      <TodoLens {...defaultProps} />
    </TestProviders>,
  )

  await expect(page.getByTestId('todo-item').filter({ hasText: 'Read chapter 4' }).getByText('biology')).toBeVisible()
  await expect(page.getByTestId('todo-item').filter({ hasText: 'Balance equations' }).getByText('chemistry')).toBeVisible()
  await expect(page.getByTestId('hidden-elsewhere')).toHaveCount(0)
})

test('ticking a to-do moves it to Done today, and unticking brings it back', async ({ mount, page, simulator }) => {
  seedPlanItem(simulator, { id: 'todo-1', kind: 'task', title: 'Flashcards' })

  await mount(
    <TestProviders>
      <TodoLens {...defaultProps} />
    </TestProviders>,
  )

  await page.getByRole('checkbox', { name: 'Done: Flashcards' }).click()
  await expect(page.getByText('Done today')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Not done yet: Flashcards' })).toHaveAttribute('aria-checked', 'true')
  expect(simulator.db.planItems[0].status).toBe('done')

  await page.getByRole('checkbox', { name: 'Not done yet: Flashcards' }).click()
  await expect(page.getByRole('checkbox', { name: 'Done: Flashcards' })).toBeVisible()
  await expect(page.getByText('Done today')).toHaveCount(0)
})

test('dismissing a to-do removes it without fuss', async ({ mount, page, simulator }) => {
  seedPlanItem(simulator, { id: 'todo-1', kind: 'task', title: 'Optional reading' })

  await mount(
    <TestProviders>
      <TodoLens {...defaultProps} />
    </TestProviders>,
  )

  await page.getByRole('button', { name: 'Not doing: Optional reading' }).click()
  await expect(page.getByText('Optional reading')).toHaveCount(0)
  expect(simulator.db.planItems[0].status).toBe('dismissed')
})

test('a to-do from earlier reads calmly, and a placed one shows its time', async ({ mount, page, simulator }) => {
  seedPlanItem(simulator, { id: 'todo-old', kind: 'task', title: 'Past block', starts_at: daysFromNow(-2, 10), ends_at: daysFromNow(-2, 11) })
  seedPlanItem(simulator, { id: 'todo-next', kind: 'task', title: 'Tomorrow block', starts_at: daysFromNow(1, 19), ends_at: daysFromNow(1, 20) })

  await mount(
    <TestProviders>
      <TodoLens {...defaultProps} />
    </TestProviders>,
  )

  await expect(page.getByTestId('todo-item').filter({ hasText: 'Past block' }).getByText(/^Still to do from /)).toBeVisible()
  await expect(page.getByTestId('todo-item').filter({ hasText: 'Tomorrow block' }).getByText('Tomorrow 19:00')).toBeVisible()
  await expect(page.getByText(/overdue/i)).toHaveCount(0)
})

test('a to-do from a lecture moment links back to it and focuses the lecture', async ({ mount, page, simulator }) => {
  seedPlanItem(simulator, {
    id: 'todo-review', kind: 'task', title: 'Review: maternal inheritance', course: 'biology',
    source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 540000,
  })
  const focused: (string | undefined)[] = []

  await mount(
    <TestProviders>
      <TodoLens {...defaultProps} onScopeChange={(patch) => focused.push(patch.recordingId)} />
    </TestProviders>,
  )

  const link = page.getByRole('button', { name: 'from: Biology Lecture: Mitochondrial DNA, 9:00' })
  await expect(link).toBeVisible()
  await link.click()
  await expect.poll(() => focused).toEqual(['rec-bio-4'])
})

test('a focused lecture highlights the to-dos made from it', async ({ mount, page, simulator }) => {
  seedPlanItem(simulator, { id: 'todo-review', kind: 'task', title: 'Review: maternal inheritance', source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 540000 })
  seedPlanItem(simulator, { id: 'todo-other', kind: 'task', title: 'Something else' })

  await mount(
    <TestProviders>
      <TodoLens {...defaultProps} highlight={{ recordingId: 'rec-bio-4' }} />
    </TestProviders>,
  )

  await expect(page.getByTestId('todo-item').filter({ hasText: 'Review: maternal inheritance' })).toHaveAttribute('data-highlighted', 'true')
  await expect(page.getByTestId('todo-item').filter({ hasText: 'Something else' })).not.toHaveAttribute('data-highlighted')
})
