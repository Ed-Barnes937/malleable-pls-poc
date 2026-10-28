import type { Page } from '@playwright/test'
import { test, expect } from '../../../playwright/fixtures'
import { TestProviders } from '../../../playwright/mount-wrapper'
import { daysFromNow, seedPlanItem } from '../../../playwright/plan-items'
import { MomentHarness } from '../../../playwright/moment-harness'
import TodoLens from './TodoLens'
import { JUST_DONE_FADE_MS, JUST_DONE_MS } from './useJustDone'

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

test('a ticked to-do strikes through in place with Done · Undo, then fades to Done today', async ({ mount, page, simulator }) => {
  seedPlanItem(simulator, { id: 'todo-1', kind: 'task', title: 'Flashcards', duration_min: 60, course: 'biology', created_at: daysFromNow(-2, 9) })
  seedPlanItem(simulator, { id: 'todo-2', kind: 'task', title: 'Lab notes', created_at: daysFromNow(-1, 9) })
  await page.clock.install()

  await mount(
    <TestProviders>
      <TodoLens {...defaultProps} />
    </TestProviders>,
  )

  await page.getByRole('checkbox', { name: 'Done: Flashcards' }).click()
  // Saved straight away, but it stays where it was, struck through, for a moment.
  await expect.poll(() => simulator.db.planItems.find((p) => p.id === 'todo-1')!.status).toBe('done')
  const rows = page.getByTestId('todo-item')
  await expect(rows.first()).toContainText('Flashcards')
  await expect(rows.first()).toHaveAttribute('data-just-done', 'shown')
  await expect(rows.first().getByText('Flashcards')).toHaveCSS('text-decoration-line', 'line-through')
  await expect(rows.first().getByText('Done', { exact: true })).toBeVisible()
  await expect(rows.first().getByRole('button', { name: 'Undo: Flashcards' })).toBeVisible()
  await expect(rows.first().getByText('1h')).toBeVisible()
  await expect(page.getByText('1 to do')).toBeVisible()
  await expect(page.getByText('Done today')).toHaveCount(0)

  // Then it fades and moves down to Done today, without the Undo chip.
  await page.clock.runFor(JUST_DONE_MS)
  await expect(rows.first()).toHaveAttribute('data-just-done', 'fading')
  await page.clock.runFor(JUST_DONE_FADE_MS)
  await expect(page.getByText('Done today')).toBeVisible()
  await expect(rows.last()).toContainText('Flashcards')
  await expect(page.getByRole('checkbox', { name: 'Not done yet: Flashcards' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('button', { name: 'Undo: Flashcards' })).toHaveCount(0)

  // Unticking from Done today brings it back.
  await page.getByRole('checkbox', { name: 'Not done yet: Flashcards' }).click()
  await expect(page.getByRole('checkbox', { name: 'Done: Flashcards' })).toBeVisible()
  await expect(page.getByText('Done today')).toHaveCount(0)
})

test('Undo right after ticking reopens the to-do where it was', async ({ mount, page, simulator }) => {
  seedPlanItem(simulator, { id: 'todo-1', kind: 'task', title: 'Flashcards' })
  await page.clock.install()

  await mount(
    <TestProviders>
      <TodoLens {...defaultProps} />
    </TestProviders>,
  )

  await page.getByRole('checkbox', { name: 'Done: Flashcards' }).click()
  await page.getByRole('button', { name: 'Undo: Flashcards' }).click()

  const row = page.getByTestId('todo-item').filter({ hasText: 'Flashcards' })
  await expect(row).not.toHaveAttribute('data-just-done')
  await expect(page.getByRole('checkbox', { name: 'Done: Flashcards' })).toHaveAttribute('aria-checked', 'false')
  await expect.poll(() => simulator.db.planItems[0].status).toBe('open')

  // Nothing fades or moves later.
  await page.clock.runFor(JUST_DONE_MS + JUST_DONE_FADE_MS)
  await expect(page.getByText('Done today')).toHaveCount(0)
  await expect(row).toBeVisible()
})

/** Holds every request to `procedure` (alone or in a batch) until `release()`; the simulator answers it then. */
async function hold(page: Page, procedure: string) {
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  // Registered after the simulator's route, so it runs first and hands over.
  await page.route((url) => url.pathname.split(/[/,]/).includes(procedure), async (route) => {
    await held
    await route.fallback()
  })
  return release
}

test('tick, Undo, tick again on a slow connection saves in that order and ends done', async ({ mount, page, simulator }) => {
  seedPlanItem(simulator, { id: 'todo-1', kind: 'task', title: 'Flashcards' })
  const releaseComplete = await hold(page, 'planItems.complete')

  await mount(
    <TestProviders>
      <TodoLens {...defaultProps} />
    </TestProviders>,
  )

  const row = page.getByTestId('todo-item').filter({ hasText: 'Flashcards' })
  await page.getByRole('checkbox', { name: 'Done: Flashcards' }).click()
  await row.getByRole('button', { name: 'Undo: Flashcards' }).click()
  await expect(row).not.toHaveAttribute('data-just-done')
  await page.getByRole('checkbox', { name: 'Done: Flashcards' }).click()
  await expect(row).toHaveAttribute('data-just-done', 'shown')

  // The first save lands; the Undo and the second tick follow it, in order.
  releaseComplete()
  await expect.poll(() => simulator.db.planItems[0].status).toBe('done')
  await expect(row).toHaveAttribute('data-just-done', 'shown')
  await expect(page.getByRole('checkbox', { name: 'Not done yet: Flashcards' })).toHaveAttribute('aria-checked', 'true')
  // And stays done: nothing late reopens it.
  await page.waitForLoadState('networkidle')
  expect(simulator.db.planItems[0].status).toBe('done')
})

test('after an Undo, a late save never flashes the to-do into Done today', async ({ mount, page, simulator }) => {
  seedPlanItem(simulator, { id: 'todo-1', kind: 'task', title: 'Flashcards' })
  const releaseComplete = await hold(page, 'planItems.complete')
  const releaseReopen = await hold(page, 'planItems.update')

  await mount(
    <TestProviders>
      <TodoLens {...defaultProps} />
    </TestProviders>,
  )

  await page.getByRole('checkbox', { name: 'Done: Flashcards' }).click()
  await page.getByRole('button', { name: 'Undo: Flashcards' }).click()

  // The tick lands (and the list refetches it as done) while the reopen is still on its way.
  const refetched = page.waitForResponse((r) => r.url().includes('planItems.list'))
  releaseComplete()
  await refetched
  expect(simulator.db.planItems[0].status).toBe('done')
  // Give the refetched rows a couple of frames to render.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await expect(page.getByRole('checkbox', { name: 'Done: Flashcards' })).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByText('Done today')).toHaveCount(0)

  releaseReopen()
  await expect.poll(() => simulator.db.planItems[0].status).toBe('open')
  await expect(page.getByRole('checkbox', { name: 'Done: Flashcards' })).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByText('Done today')).toHaveCount(0)
})

test('a to-do reopened elsewhere while its tick is saving ends open', async ({ mount, page, simulator }) => {
  seedPlanItem(simulator, { id: 'todo-1', kind: 'task', title: 'Flashcards' })

  await mount(
    <TestProviders>
      <TodoLens {...defaultProps} />
    </TestProviders>,
  )
  const row = page.getByTestId('todo-item').filter({ hasText: 'Flashcards' })
  await expect(row).toBeVisible()

  // The tick saves, but the lists' refetch is slow...
  const releaseLists = await hold(page, 'planItems.list')
  await page.getByRole('checkbox', { name: 'Done: Flashcards' }).click()
  await expect.poll(() => simulator.db.planItems[0].status).toBe('done')
  await expect(row).toHaveAttribute('data-just-done', 'shown')

  // ...and meanwhile another device reopens it.
  simulator.db.planItems[0].status = 'open'
  releaseLists()

  await expect(page.getByRole('checkbox', { name: 'Done: Flashcards' })).toHaveAttribute('aria-checked', 'false')
  await expect(row).not.toHaveAttribute('data-just-done')
  await expect(page.getByText('Done today')).toHaveCount(0)
  await expect(page.getByText('1 to do')).toBeVisible()
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

  const link = page.getByRole('button', { name: 'From Biology Lecture: Mitochondrial DNA · 9:00' })
  await expect(link).toBeVisible()
  await link.click()
  await expect.poll(() => focused).toEqual(['rec-bio-4'])
})

test('a to-do from a lecture moment jumps to that moment, or says no board has a Transcript', async ({ mount, page, simulator }) => {
  seedPlanItem(simulator, {
    id: 'todo-review', kind: 'task', title: 'Review: maternal inheritance', course: 'biology',
    source_type: 'recording', source_id: 'rec-bio-4', source_offset_ms: 540000,
  })
  // `no-viewer`: the shell found no board with a Transcript to open it on.
  await mount(<MomentHarness lens="todo" result="no-viewer" />)

  await page.getByRole('button', { name: 'From Biology Lecture: Mitochondrial DNA · 9:00' }).click()
  await expect(page.getByTestId('moment-calls').getByRole('listitem')).toHaveText(['rec-bio-4@540000'])
  await expect(page.getByTestId('todo-moment')).toHaveText('None of your boards has a Transcript yet.')
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
