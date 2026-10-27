import { test, expect } from '../../../playwright/fixtures'
import { TestProviders } from '../../../playwright/mount-wrapper'
import { daysFromNow, seedPlanItem } from '../../../playwright/plan-items'
import ComingUpLens from './ComingUpLens'

const defaultProps = {
  panelId: 'test-panel',
  scope: {},
  config: {},
}

function seedWeek(simulator: Parameters<typeof seedPlanItem>[0]) {
  seedPlanItem(simulator, { id: 'quiz', kind: 'deadline', title: 'Biology quiz', course: 'biology', due_at: daysFromNow(3, 10) })
  seedPlanItem(simulator, { id: 'lab', kind: 'deadline', title: 'Lab report', course: 'chemistry', due_at: daysFromNow(4, 17) })
  seedPlanItem(simulator, { id: 'far', kind: 'deadline', title: 'Essay', course: 'biology', due_at: daysFromNow(20, 17) })
  seedPlanItem(simulator, { id: 'missed', kind: 'deadline', title: 'Problem sheet', course: 'chemistry', due_at: daysFromNow(-2, 17) })
  seedPlanItem(simulator, { id: 'done', kind: 'deadline', title: 'Handed in', course: 'biology', due_at: daysFromNow(1, 17), status: 'done' })
  seedPlanItem(simulator, { id: 'todo', kind: 'task', title: 'A to-do', course: 'biology', due_at: daysFromNow(1, 17) })
}

test('shows open deadlines in the next 14 days, grouped by day, with anything missed gently first', async ({ mount, page, simulator }) => {
  seedWeek(simulator)

  await mount(
    <TestProviders>
      <ComingUpLens {...defaultProps} />
    </TestProviders>,
  )

  const items = page.getByTestId('coming-up-item')
  await expect(items).toHaveText([/Problem sheet/, /Biology quiz/, /Lab report/])
  await expect(page.getByRole('heading', { name: /^Still to do from / })).toBeVisible()
  await expect(page.getByText('Essay')).toHaveCount(0)
  await expect(page.getByText('Handed in')).toHaveCount(0)
  await expect(page.getByText('A to-do')).toHaveCount(0)
  await expect(page.getByText(/overdue/i)).toHaveCount(0)
})

test('a course-filtered board says what it leaves out, and still shows its missed deadlines', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  seedPlanItem(simulator, { id: 'bio-missed', kind: 'deadline', title: 'Reading log', course: 'biology', due_at: daysFromNow(-5, 17) })

  await mount(
    <TestProviders>
      <ComingUpLens {...defaultProps} scope={{ courseTag: 'biology' }} />
    </TestProviders>,
  )

  await expect(page.getByTestId('coming-up-item')).toHaveText([/Reading log/, /Biology quiz/])
  await expect(page.getByText('+2 in other courses')).toBeVisible()
})

test('missed deadlines share one calm group, and untagged ones are not counted as other courses', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  seedPlanItem(simulator, { id: 'bio-missed', kind: 'deadline', title: 'Reading log', course: 'biology', due_at: daysFromNow(-5, 17) })
  seedPlanItem(simulator, { id: 'bio-missed-2', kind: 'deadline', title: 'Worksheet', course: 'biology', due_at: daysFromNow(-1, 17) })
  seedPlanItem(simulator, { id: 'untagged', kind: 'deadline', title: 'Library book', due_at: daysFromNow(2, 12) })

  await mount(
    <TestProviders>
      <ComingUpLens {...defaultProps} scope={{ courseTag: 'biology' }} />
    </TestProviders>,
  )

  const earlier = page.getByRole('region', { name: 'Still to do from earlier (2)' })
  await expect(earlier.getByTestId('coming-up-item')).toHaveText([/Worksheet/, /Reading log/])
  await expect(page.getByRole('heading', { name: /^Still to do/ })).toHaveCount(1)
  await expect(page.getByTestId('hidden-elsewhere')).toHaveText('+2 in other courses · 1 with no course')
})

test('the look-ahead is a knob saved to the widget config', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  const patches: Record<string, unknown>[] = []

  const component = await mount(
    <TestProviders>
      <ComingUpLens {...defaultProps} onConfigChange={(patch) => patches.push(patch)} />
    </TestProviders>,
  )

  const knob = page.getByRole('combobox', { name: 'Look ahead' })
  await expect(knob).toHaveValue('14')
  await knob.selectOption({ label: 'Next 30 days' })
  await expect.poll(() => patches).toEqual([{ lookAheadDays: 30 }])

  // The shell feeds the saved config back in.
  await component.update(
    <TestProviders>
      <ComingUpLens {...defaultProps} config={{ lookAheadDays: 30 }} />
    </TestProviders>,
  )
  await expect(page.getByText('Essay')).toBeVisible()
})

test('says so calmly when nothing is due', async ({ mount, page }) => {
  await mount(
    <TestProviders>
      <ComingUpLens {...defaultProps} config={{ lookAheadDays: 7 }} />
    </TestProviders>,
  )

  await expect(page.getByText('Nothing due in the next 7 days.')).toBeVisible()
})

test('clicking a deadline focuses the board on its course', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  const courses: (string | undefined)[] = []

  await mount(
    <TestProviders>
      <ComingUpLens {...defaultProps} onScopeChange={(patch) => courses.push(patch.courseTag)} />
    </TestProviders>,
  )

  await page.getByRole('button', { name: /Lab report/ }).click()
  await expect.poll(() => courses).toEqual(['chemistry'])
})

test('a focused lecture highlights deadlines linked to it', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  seedPlanItem(simulator, { id: 'linked', kind: 'deadline', title: 'Lecture quiz', course: 'biology', due_at: daysFromNow(2, 9), source_type: 'recording', source_id: 'rec-bio-4' })

  await mount(
    <TestProviders>
      <ComingUpLens {...defaultProps} highlight={{ recordingId: 'rec-bio-4' }} />
    </TestProviders>,
  )

  await expect(page.getByTestId('coming-up-item').filter({ hasText: 'Lecture quiz' })).toHaveAttribute('data-highlighted', 'true')
  await expect(page.getByTestId('coming-up-item').filter({ hasText: 'Biology quiz' })).not.toHaveAttribute('data-highlighted')
})
