import { test, expect } from '../../../playwright/fixtures'
import { TestProviders } from '../../../playwright/mount-wrapper'
import { daysFromNow, seedPlanItem } from '../../../playwright/plan-items'
import { MomentHarness } from '../../../playwright/moment-harness'
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
  await page.getByRole('combobox', { name: 'Time estimate' }).selectOption({ label: '30m' })
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

test('to-dos with no course are reported as such, not as in other courses', async ({ mount, page, simulator }) => {
  seedPlanItem(simulator, { id: 'todo-bio', kind: 'task', title: 'Read chapter 4', course: 'biology' })
  seedPlanItem(simulator, { id: 'todo-chem', kind: 'task', title: 'Balance equations', course: 'chemistry' })
  seedPlanItem(simulator, { id: 'todo-none', kind: 'task', title: 'Buy lab goggles' })

  await mount(
    <TestProviders>
      <TodoLens {...defaultProps} scope={{ courseTag: 'biology' }} />
    </TestProviders>,
  )

  await expect(page.getByText('Read chapter 4')).toBeVisible()
  await expect(page.getByText('Buy lab goggles')).toHaveCount(0)
  await expect(page.getByTestId('hidden-elsewhere')).toHaveText('+1 in other courses · 1 with no course')
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

test('a to-do from a lecture moment jumps to that moment, or offers a board with a Transcript', async ({ mount, page, simulator }) => {
  seedPlanItem(simulator, {
    id: 'todo-review', kind: 'task', title: 'Review: maternal inheritance', course: 'biology',
    source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 540000,
  })
  await mount(<MomentHarness lens="todo" result="no-viewer" />)

  await page.getByRole('button', { name: 'from: Biology Lecture: Mitochondrial DNA, 9:00' }).click()
  await expect(page.getByTestId('todo-moment')).toContainText('This board has no Transcript.')
  await page.getByRole('button', { name: 'Open in a board with Transcript' }).click()
  await expect(page.getByTestId('moment-calls').getByRole('listitem')).toHaveText(['rec-bio-4@540000', 'rec-bio-4@540000 elsewhere'])
  await expect(page.getByTestId('todo-moment')).toHaveCount(0)
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

test.describe('blocks that did not happen', () => {
  const seedMissed = (simulator: Parameters<typeof seedPlanItem>[0]) => {
    seedPlanItem(simulator, { id: 'missed-1', kind: 'task', title: 'Read chapter 5', duration_min: 30, starts_at: daysFromNow(-2, 10), ends_at: daysFromNow(-2, 11), course: 'biology' })
    seedPlanItem(simulator, { id: 'missed-2', kind: 'task', title: 'Lab write-up', starts_at: daysFromNow(-1, 19), ends_at: daysFromNow(-1, 20), course: 'chemistry' })
    // Never re-fit: a missed class, and a block ticked off.
    seedPlanItem(simulator, { id: 'class', kind: 'commitment', title: 'Biology lecture', starts_at: daysFromNow(-1, 9), ends_at: daysFromNow(-1, 10) })
    seedPlanItem(simulator, { id: 'done', kind: 'task', title: 'Done block', status: 'done', starts_at: daysFromNow(-1, 15), ends_at: daysFromNow(-1, 16) })
  }

  test('asks calmly, previews new times and moves them on accept', async ({ mount, page, simulator }) => {
    seedMissed(simulator)
    await mount(
      <TestProviders>
        <TodoLens {...defaultProps} />
      </TestProviders>,
    )

    const banner = page.getByTestId('refit-banner')
    await expect(banner).toContainText("2 blocks didn't happen. Re-fit them?")
    await expect(page.getByText(/overdue|missed/i)).toHaveCount(0)

    await banner.getByRole('button', { name: 'Re-fit' }).click()
    const proposals = banner.getByTestId('refit-proposal')
    await expect(proposals).toHaveCount(2)
    await expect(proposals.first()).toContainText('Read chapter 5')

    await banner.getByRole('button', { name: 'Move them' }).click()
    await expect(page.getByRole('status')).toHaveText("Moved 2 blocks. They're in your calendar.")
    await expect(page.getByTestId('refit-banner')).toHaveCount(0)
    const moved = simulator.db.planItems.find((p) => p.id === 'missed-1')!
    expect(Date.parse(moved.starts_at!)).toBeGreaterThan(Date.now() - 60_000)
    expect(Date.parse(moved.ends_at!) - Date.parse(moved.starts_at!)).toBe(30 * 60_000)
    expect(simulator.db.planItems.find((p) => p.id === 'class')!.starts_at).toBe(daysFromNow(-1, 9))
  })

  test('keep my plan leaves everything where it is', async ({ mount, page, simulator }) => {
    seedMissed(simulator)
    await mount(
      <TestProviders>
        <TodoLens {...defaultProps} />
      </TestProviders>,
    )

    const banner = page.getByTestId('refit-banner')
    await banner.getByRole('button', { name: 'Re-fit' }).click()
    await banner.getByRole('button', { name: 'Keep my plan' }).click()
    await expect(page.getByTestId('refit-banner')).toHaveCount(0)
    expect(simulator.db.planItems.find((p) => p.id === 'missed-1')!.starts_at).toBe(daysFromNow(-2, 10))
  })

  test('a course board offers only its own course', async ({ mount, page, simulator }) => {
    seedMissed(simulator)
    await mount(
      <TestProviders>
        <TodoLens {...defaultProps} scope={{ courseTag: 'biology' }} />
      </TestProviders>,
    )

    await expect(page.getByTestId('refit-banner')).toContainText("1 block didn't happen. Re-fit it?")
  })

  test('if the week changed since the preview, it shows fresh times instead', async ({ mount, page, simulator }) => {
    seedMissed(simulator)
    await mount(
      <TestProviders>
        <TodoLens {...defaultProps} />
      </TestProviders>,
    )

    const banner = page.getByTestId('refit-banner')
    await banner.getByRole('button', { name: 'Re-fit' }).click()
    await expect(banner.getByTestId('refit-proposal')).toHaveCount(2)
    // Ticked off elsewhere meanwhile.
    simulator.db.planItems.find((p) => p.id === 'missed-1')!.status = 'done'
    await banner.getByRole('button', { name: 'Move them' }).click()

    await expect(banner.getByText('Your week changed, so here are fresh times.')).toBeVisible()
    await expect(banner.getByTestId('refit-proposal')).toHaveCount(1)
    await expect(banner.getByTestId('refit-proposal')).toContainText('Lab write-up')
    await banner.getByRole('button', { name: 'Move it' }).click()
    await expect(page.getByRole('status')).toHaveText("Moved 1 block. It's in your calendar.")
  })

  test('a block that does not fit is reported once, not asked about again', async ({ mount, page, simulator }) => {
    seedMissed(simulator)
    // Due in 5 minutes: no time left to fit an hour.
    seedPlanItem(simulator, {
      id: 'no-fit', kind: 'task', title: 'Essay plan', duration_min: 60, starts_at: daysFromNow(-1, 15), ends_at: daysFromNow(-1, 16),
      due_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    })
    await mount(
      <TestProviders>
        <TodoLens {...defaultProps} />
      </TestProviders>,
    )

    const banner = page.getByTestId('refit-banner')
    await banner.getByRole('button', { name: 'Re-fit' }).click()
    await expect(banner.getByTestId('refit-proposal').filter({ hasText: 'Essay plan' })).toContainText('No free time before it is due')
    await banner.getByRole('button', { name: 'Move them' }).click()

    await expect(page.getByRole('status')).toHaveText(
      "Moved 2 blocks. They're in your calendar. 1 didn't fit before it is due, so it stays on your to-do list.",
    )
    await expect(page.getByTestId('refit-banner')).toHaveCount(0)
    await expect(page.getByTestId('todo-item').filter({ hasText: 'Essay plan' })).toBeVisible()
  })
})
