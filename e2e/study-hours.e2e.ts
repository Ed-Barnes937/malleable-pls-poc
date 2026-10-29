import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { startOfLocalDay, wallClock, zonedTimeToUtc } from '../packages/scheduler/src'
import { WEEKDAYS, type PlanItemOccurrence, type StudyHours, type UserPreferences } from '../packages/substrate/src'
import { CalendarPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { trpcMutation, trpcQuery } from './api'
import { expectedReviewSlots } from './review-placement'

/**
 * Study hours (S1a): the student's preference bounds everything placed
 * automatically (Auto-fill and the confusion automation's reviews), never
 * what they place by hand. Set through the API here; the editor is S1b.
 */

const TZ = 'Europe/London'

interface Row { id: string; title: string; starts_at: string | null; ends_at: string | null }

const weekdayOf = (instant: number) => {
  const w = wallClock(instant, TZ)
  return WEEKDAYS[(new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay() + 6) % 7]
}
const hoursOnly = (open: Partial<StudyHours>): StudyHours =>
  ({ ...Object.fromEntries(WEEKDAYS.map((d) => [d, null])), ...open }) as StudyHours
const tenToTen = { start: '10:00', end: '22:00' }
/** Every day from 10:00, no study on Sunday. */
const lateStartNoSunday: StudyHours = { ...hoursOnly({}), mon: tenToTen, tue: tenToTen, wed: tenToTen, thu: tenToTen, fri: tenToTen, sat: tenToTen }

const thisMonday = (() => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
})()
const at = (week: number, day: number, h: number, m = 0) =>
  new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() + week * 7 + day, h, m).toISOString()

/** A fresh board with just a Calendar, and no plan items (the reseed adds Priya's week). */
async function emptyWeek(request: APIRequestContext) {
  for (const item of await trpcQuery<Row[]>(request, 'planItems.list')) {
    await trpcMutation(request, 'planItems.delete', item.id)
  }
  const ws = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: 'Week plan' })
  await trpcMutation(request, 'workspaces.addPanel', {
    workspaceId: ws.id, lensType: 'calendar', slotName: 'calendar', pos_x: 24, pos_y: 24, width: 1100, height: 680,
  })
}

async function openCalendar(page: Page) {
  await page.goto('/')
  await new TopBarPom(page).switchToWorkspace('Week plan')
  const calendar = new CalendarPom(page)
  await expect(calendar.grid).toBeVisible()
  return calendar
}

test.describe('Study hours', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('Auto-fill drafts only inside study hours: nothing before 10:00, nothing on a no-study Sunday', async ({ page, request }) => {
    await emptyWeek(request)
    await trpcMutation(request, 'preferences.update', { study_hours: lateStartNoSunday })
    for (let i = 1; i <= 7; i++) {
      await trpcMutation(request, 'planItems.create', { kind: 'task', title: `Past paper ${i}`, duration_min: 120, due_at: null, course: 'biology' })
    }

    const calendar = await openCalendar(page)
    await calendar.nextWeek()
    await calendar.root.getByTestId('help-me-plan').click()
    const panel = calendar.root.getByTestId('help-me-plan-panel')
    // Six study days x 2h; Sunday counts for nothing.
    await expect(panel.getByTestId('plan-capacity')).toContainText('About 12 hours of study time left next week (2h a day). Your to-dos need 14.')

    await panel.getByTestId('autofill').click()
    await expect(calendar.root.getByTestId('calendar-ghost')).toHaveCount(6, { timeout: 15000 })
    await panel.getByRole('button', { name: 'Accept draft' }).click()
    await expect(calendar.root.getByTestId('calendar-ghost')).toHaveCount(0)

    const placed = (await trpcQuery<Row[]>(request, 'planItems.list', { kinds: ['task'] })).filter((t) => t.starts_at)
    expect(placed).toHaveLength(6)
    // Earliest fit: 10:00-12:00 on Monday to Saturday of next week.
    expect(placed.map((t) => t.starts_at).sort()).toEqual([0, 1, 2, 3, 4, 5].map((d) => at(1, d, 10)))
  })

  test('"Study time per day" saves the preference, for every board and the server', async ({ page, request }) => {
    await emptyWeek(request)
    await trpcMutation(request, 'planItems.create', { kind: 'task', title: 'Essay plan', duration_min: 120, due_at: null, course: 'biology' })
    const calendar = await openCalendar(page)
    await calendar.nextWeek()
    await calendar.root.getByTestId('help-me-plan').click()
    const panel = calendar.root.getByTestId('help-me-plan-panel')
    await expect(panel.getByTestId('plan-capacity')).toContainText('(2h a day)')

    await panel.getByRole('button', { name: 'Change study hours' }).click()
    const editor = page.getByRole('dialog', { name: 'When do you study?' })
    await editor.getByLabel('Study time per day').selectOption('60')
    await editor.getByRole('button', { name: 'Save' }).click()
    await expect(panel.getByTestId('plan-capacity')).toContainText('About 7 hours of study time left next week (1h a day).')
    await expect.poll(async () => (await trpcQuery<UserPreferences>(request, 'preferences.get')).study_min_per_day).toBe(60)

    // A reload (or any other board) reads it back.
    await page.reload()
    await new TopBarPom(page).switchToWorkspace('Week plan')
    await calendar.nextWeek()
    await calendar.root.getByTestId('help-me-plan').click()
    await expect(panel.getByTestId('study-rhythm')).toContainText('1h a day')
    await panel.getByRole('button', { name: 'Change study hours' }).click()
    await expect(editor.getByLabel('Study time per day')).toHaveValue('60')
  })

  for (const { name, viewport } of [
    { name: 'on a laptop', viewport: { width: 1440, height: 900 } },
    { name: 'on a phone', viewport: { width: 400, height: 860 } },
  ]) {
    test(`${name}: changing study hours in Help me plan re-plans the draft straight away, and they stay`, async ({ page, request }) => {
      await page.setViewportSize(viewport)
      await emptyWeek(request)
      for (let i = 1; i <= 7; i++) {
        await trpcMutation(request, 'planItems.create', { kind: 'task', title: `Past paper ${i}`, duration_min: 120, due_at: null, course: 'biology' })
      }
      const calendar = await openCalendar(page)
      // A phone opens on Day view; Help me plan plans a week.
      if (viewport.width < 600) await calendar.root.getByRole('tab', { name: 'Week' }).click()
      await calendar.nextWeek()
      await calendar.root.getByTestId('help-me-plan').click()
      const panel = calendar.root.getByTestId('help-me-plan-panel')
      await expect(panel.getByTestId('study-rhythm')).toContainText('Study 09:00-22:00')

      // A draft in the default hours: 09:00-11:00 every day.
      const autofills: string[] = []
      page.on('request', (r) => { if (r.url().includes('planning.autofill')) autofills.push(r.url()) })
      await panel.getByTestId('autofill').click()
      const ghosts = calendar.root.getByTestId('calendar-ghost')
      await expect(ghosts).toHaveCount(7, { timeout: 15000 })
      await expect(ghosts.first()).toHaveAttribute('aria-label', /, 09:00 - 11:00$/)

      // From 10:00, and no study on Sunday.
      await panel.getByRole('button', { name: 'Change study hours' }).click()
      const editor = page.getByRole('dialog', { name: 'When do you study?' })
      await editor.getByLabel('Start time, every day').selectOption('10:00')
      await editor.getByRole('button', { name: 'Different on some days' }).click()
      await editor.getByRole('checkbox', { name: 'No study on Sunday' }).check()
      await editor.getByRole('button', { name: 'Save' }).click()
      await expect(editor).toBeHidden()
      await expect(panel.getByTestId('study-rhythm')).toContainText('Study 10:00-22:00, no study Sun')

      // The draft re-plans at once, with no second Auto-fill: six blocks, 10:00-12:00 Monday to Saturday.
      await expect(ghosts).toHaveCount(6)
      for (const ghost of await ghosts.all()) await expect(ghost).toHaveAttribute('aria-label', /, 10:00 - 12:00$/)
      expect(autofills).toHaveLength(1)
      await panel.getByRole('button', { name: 'Accept draft' }).click()
      await expect(ghosts).toHaveCount(0)
      const placed = (await trpcQuery<Row[]>(request, 'planItems.list', { kinds: ['task'] })).filter((t) => t.starts_at)
      expect(placed.map((t) => t.starts_at).sort()).toEqual([0, 1, 2, 3, 4, 5].map((d) => at(1, d, 10)))

      // Saved with the zone the browser is in, the first time study hours are saved.
      expect(await trpcQuery<UserPreferences>(request, 'preferences.get')).toEqual({
        time_zone: TZ,
        study_hours: lateStartNoSunday,
        study_min_per_day: 120,
      })

      // A reload keeps them; while planning, the hours outside study time are washed, all of Sunday included.
      await page.reload()
      await new TopBarPom(page).switchToWorkspace('Week plan')
      if (viewport.width < 600) await calendar.root.getByRole('tab', { name: 'Week' }).click()
      await calendar.nextWeek()
      await expect(calendar.root.getByTestId('calendar-off-hours')).toHaveCount(0)
      await calendar.root.getByTestId('help-me-plan').click()
      await expect(panel.getByTestId('study-rhythm')).toContainText('Study 10:00-22:00, no study Sun')
      const sunday = calendar.days.nth(6)
      await expect(sunday.getByTestId('calendar-off-hours')).toHaveCount(1)
      expect((await sunday.getByTestId('calendar-off-hours').boundingBox())!.height).toBeCloseTo((await sunday.boundingBox())!.height, 0)
      // Monday: before 10:00 and after 22:00.
      await expect(calendar.days.first().getByTestId('calendar-off-hours')).toHaveCount(2)
    })
  }

  test('a new confusion review goes only where the student studies', async ({ request }) => {
    await emptyWeek(request)
    // Only the day after tomorrow, from 10:00: today, tomorrow and every other day are "no study".
    const open = startOfLocalDay(Date.now(), TZ, 2)
    await trpcMutation(request, 'preferences.update', { study_hours: hoursOnly({ [weekdayOf(open)]: tenToTen }) })

    const marked = { from: Date.now(), to: 0 }
    await trpcMutation(request, 'tags.create', { target_type: 'transcript_segment', target_id: 'seg-bio4-05', label: 'confused' })
    marked.to = Date.now()
    let review: PlanItemOccurrence | undefined
    await expect.poll(async () => {
      const items = await trpcQuery<PlanItemOccurrence[]>(request, 'planItems.list', { sourceType: 'recording', sourceId: 'rec-bio-4', statuses: ['open'] })
      review = items.find((i) => i.source_offset_ms === 724000 && i.starts_at)
      return !!review
    }, { timeout: 15000 }).toBe(true)

    const w = wallClock(open, TZ)
    expect(Date.parse(review!.starts_at!)).toBe(zonedTimeToUtc(w.year, w.month, w.day, 10 * 60, TZ))
    expect(Date.parse(review!.ends_at!) - Date.parse(review!.starts_at!)).toBe(20 * 60_000)
    // And it is exactly what the shared rule says, with the preference applied.
    const expected = await expectedReviewSlots(
      request,
      { id: review!.id, durationMin: 20, latest: startOfLocalDay(marked.from, TZ, 4) },
      marked,
      TZ,
    )
    expect(expected).toContainEqual({ start: Date.parse(review!.starts_at!), end: Date.parse(review!.ends_at!) })
  })

  test('dragging a block by hand outside study hours is still allowed', async ({ page, request }) => {
    await emptyWeek(request)
    await trpcMutation(request, 'preferences.update', { study_hours: lateStartNoSunday })
    const task = await trpcMutation<{ id: string }>(request, 'planItems.create', {
      kind: 'task', title: 'Revise respiration', starts_at: at(0, 2, 16), ends_at: at(0, 2, 17), duration_min: 60, course: 'biology',
    })
    const calendar = await openCalendar(page)
    await expect(calendar.block('Revise respiration')).toBeVisible()

    // To Sunday (no study) at 07:00 (before study hours start).
    const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('planItems.update'))
    await calendar.drag({ dayIndex: 2, hours: 16.25 }, { dayIndex: 6, hours: 7.25 })
    await expect(calendar.block('Revise respiration')).toHaveAttribute('aria-label', /07:00 - 08:00/)
    expect((await saved).ok()).toBe(true)
    expect(await trpcQuery<Row>(request, 'planItems.byId', task.id)).toMatchObject({ starts_at: at(0, 6, 7), ends_at: at(0, 6, 8) })
  })
})
