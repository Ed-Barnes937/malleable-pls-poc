import { test, expect } from '../../../playwright/fixtures'
import { ShellProviders } from '../../../playwright/mount-wrapper'
import { seedPlanItem } from '../../../playwright/plan-items'
import type { BackendSimulator } from '../../../playwright/backend-simulator'
import { UpNext } from './UpNext'

// Tuesday 27 Oct 2026, 09:00 in London (GMT), the zone CT runs in.
const NOW = new Date('2026-10-27T09:00:00Z')
const at = (time: string, day = '27') => `2026-10-${day}T${time}:00.000Z`

async function freeze(page: import('@playwright/test').Page, simulator: BackendSimulator) {
  await page.clock.setFixedTime(NOW)
  simulator.freezeNow(NOW)
}

function seedWeek(simulator: BackendSimulator) {
  seedPlanItem(simulator, { id: 'chem', kind: 'commitment', title: 'Chemistry lecture', subtype: 'class', course: 'chemistry', starts_at: at('14:00'), ends_at: at('16:00') })
  seedPlanItem(simulator, { id: 'shift', kind: 'commitment', title: 'Cafe shift', subtype: 'shift', starts_at: at('17:00'), ends_at: at('22:00') })
  seedPlanItem(simulator, { id: 'study', kind: 'task', title: 'Revise respiration', starts_at: at('10:00', '28'), ends_at: at('11:00', '28'), duration_min: 60 })
  seedPlanItem(simulator, { id: 'quiz', kind: 'deadline', title: 'Biology quiz', due_at: at('10:00', '29') })
  seedPlanItem(simulator, { id: 'todo', kind: 'task', title: 'Lab report', due_at: at('17:00', '30'), duration_min: 180 })
}

function mountUpNext(mount: Parameters<Parameters<typeof test>[2]>[0]['mount'], props: { boardHasCalendar?: boolean } = {}) {
  const calls = { plan: 0, add: 0 }
  return {
    calls,
    mounted: mount(
      <ShellProviders>
        <div className="p-8">
          <UpNext
            boardHasCalendar={props.boardHasCalendar ?? false}
            onPlanWeek={() => { calls.plan += 1 }}
            onAddCalendar={() => { calls.add += 1 }}
          />
        </div>
      </ShellProviders>,
    ),
  }
}

test('names the next item, and the popover lists the week with a summary', async ({ mount, page, simulator }) => {
  await freeze(page, simulator)
  seedWeek(simulator)
  await mountUpNext(mount).mounted

  const button = page.getByTestId('up-next')
  await expect(button).toContainText('Up next: Chemistry 14:00')
  await button.click()
  const popover = page.getByTestId('up-next-popover')
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('region', { name: 'Today' }).getByTestId('up-next-item')).toHaveCount(2)
  await expect(popover.getByRole('region', { name: 'Tomorrow' })).toContainText('Revise respiration')
  await expect(popover.getByRole('region', { name: 'Due this week' })).toContainText('Biology quiz')
  await expect(popover.getByRole('region', { name: 'Due this week' })).toContainText('Lab report')
  // 1h of study booked (tomorrow's); the lab report's 3h is not booked yet.
  await expect(popover.getByTestId('up-next-summary')).toHaveText('1h of study booked for the rest of the week · 1 to-do (3h) not booked yet')
})

test('with nothing booked it reads Plan your week', async ({ mount, page, simulator }) => {
  await freeze(page, simulator)
  await mountUpNext(mount).mounted
  await expect(page.getByTestId('up-next')).toHaveText('Plan your week')
  await page.getByTestId('up-next').click()
  await expect(page.getByTestId('up-next-empty')).toBeVisible()
})

test('says now while an item is on', async ({ mount, page, simulator }) => {
  seedWeek(simulator)
  const during = new Date('2026-10-27T15:00:00Z')
  await page.clock.setFixedTime(during)
  simulator.freezeNow(during)
  await mountUpNext(mount).mounted
  await expect(page.getByTestId('up-next')).toContainText('Chemistry now')
})

test('Plan my week and Add Calendar hand over to the board; Add Calendar is hidden when it has one', async ({ mount, page, simulator }) => {
  await freeze(page, simulator)
  seedWeek(simulator)
  const { calls, mounted } = mountUpNext(mount)
  await mounted
  await page.getByTestId('up-next').click()
  await page.getByTestId('up-next-add-calendar').click()
  await expect(page.getByTestId('up-next-popover')).toHaveCount(0)
  await page.getByTestId('up-next').click()
  await page.getByTestId('up-next-plan-week').click()
  await expect(page.getByTestId('up-next-popover')).toHaveCount(0)
  expect(calls).toEqual({ plan: 1, add: 1 })
})

test('Add Calendar is hidden on a board that has one', async ({ mount, page, simulator }) => {
  await freeze(page, simulator)
  seedWeek(simulator)
  await mountUpNext(mount, { boardHasCalendar: true }).mounted
  await page.getByTestId('up-next').click()
  await expect(page.getByTestId('up-next-plan-week')).toBeVisible()
  await expect(page.getByTestId('up-next-add-calendar')).toHaveCount(0)
})

test('focus moves in; Escape closes it and focus returns to the button', async ({ mount, page, simulator }) => {
  await freeze(page, simulator)
  seedWeek(simulator)
  await mountUpNext(mount).mounted
  const button = page.getByTestId('up-next')
  await button.focus()
  await page.keyboard.press('Enter')
  const popover = page.getByTestId('up-next-popover')
  await expect(popover).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
  await expect(button).toBeFocused()
  // A press outside closes it too.
  await button.click()
  await expect(popover).toBeVisible()
  await page.mouse.click(600, 500)
  await expect(popover).toHaveCount(0)
})
