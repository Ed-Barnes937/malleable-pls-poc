import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './test'
import type { APIRequestContext } from '@playwright/test'
import type { Lecture } from '../packages/substrate/src'
import { classLectureTitle } from '../packages/substrate/src/class-occurrences'
import { startOfLocalDay } from '../packages/scheduler/src'
import { CalendarPom, TopBarPom } from './pom'
import { trpcMutation, trpcQuery } from './api'
import { apiUrl } from './ports'
import { reseed } from './reseed'
import { SEED_TIME_ZONE } from './seed-week'

/**
 * A class that changes course takes its future lectures with it; past ones
 * stay, and so does a recorded one (Round 4). The student changes it where
 * they see it, in the calendar, and the board showing its next lecture
 * follows.
 *
 * Clock-independent: the class is weekly at 07:00 London from a week ago, and
 * only last week's, next week's and the week after's occurrences are used.
 */

const DAY_MS = 24 * 60 * 60_000
const WEEK_MS = 7 * DAY_MS

const localDate = (at: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SEED_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)

async function lectureOf(request: APIRequestContext, classId: string, date: string) {
  const lectures = await trpcQuery<Lecture[]>(request, 'lectures.list', {})
  return lectures.find((l) => l.class_item_id === classId && l.class_date === date)
}

test.describe('A class changing course', () => {
  test.beforeEach(async () => { await reseed() })
  test.afterAll(async () => { await reseed() })

  test('takes its next lecture with it on the board; last week\'s and a recorded one stay', async ({ page, request }) => {
    const ws = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: 'Plan', courseTag: 'biology' })
    await trpcMutation(request, 'workspaces.addPanel', { workspaceId: ws.id, lensType: 'calendar', slotName: 'calendar', pos_x: 24, pos_y: 24, width: 900, height: 640 })

    const today = startOfLocalDay(Date.now(), SEED_TIME_ZONE) + 7 * 60 * 60_000
    const start = today - WEEK_MS
    const cls = await trpcMutation<{ id: string }>(request, 'planItems.create', {
      kind: 'commitment', title: 'Genetics lecture', subtype: 'class', course: 'biology',
      starts_at: new Date(start).toISOString(), ends_at: new Date(start + 60 * 60_000).toISOString(),
      recurrence: { freq: 'weekly', timeZone: SEED_TIME_ZONE }, timeZone: SEED_TIME_ZONE,
    })
    const lastWeek = localDate(today - WEEK_MS)
    const nextWeek = localDate(today + WEEK_MS)
    const inTwoWeeks = localDate(today + 2 * WEEK_MS)
    // Last week's lecture, and the one in two weeks, already recorded (a pre-recorded talk).
    await trpcMutation(request, 'lectures.forClassOccurrence', { planItemId: cls.id, date: lastWeek })
    const { lecture: recorded } = await trpcMutation<{ lecture: Lecture }>(request, 'lectures.forClassOccurrence', { planItemId: cls.id, date: inTwoWeeks })
    const upload = await request.post(`${apiUrl}/upload`, {
      headers: {
        'content-type': 'audio/wav', 'x-user-id': 'dev-user-1', 'x-recording-title': 'Pre-recorded talk',
        'x-lecture-id': recorded.id, 'x-recording-duration': String(50 * 60_000),
      },
      data: readFileSync(path.join(__dirname, 'fixtures', 'lecture-tone.wav')),
    })
    expect(upload.ok(), await upload.text()).toBe(true)

    await page.goto('/')
    const topBar = new TopBarPom(page)
    await topBar.switchToWorkspace('Plan')
    await topBar.expectActiveWorkspace('Plan')
    const calendar = new CalendarPom(page)

    // Next week's class: opening it focuses its lecture here.
    await calendar.nextWeek()
    await calendar.block('Genetics lecture').click()
    const nextTitle = classLectureTitle('Genetics lecture', nextWeek)
    await expect(calendar.popover.getByTestId('class-lecture').getByRole('status')).toContainText(nextTitle)
    await topBar.expectScope('Biology', nextTitle)

    // The student moves the class to Chemistry.
    await calendar.popover.getByLabel('Course', { exact: true }).selectOption('chemistry')
    await calendar.popover.getByRole('button', { name: 'Save' }).click()
    await expect(calendar.popover).toHaveCount(0)

    // The board follows its lecture to Chemistry, and the lecture picker
    // there lists it, but not last week's or the recorded one.
    await topBar.expectScope('Chemistry', nextTitle)
    const options = topBar.lectureSelect.locator('option')
    await expect(options.filter({ hasText: nextTitle })).toHaveCount(1)
    await expect(options.filter({ hasText: classLectureTitle('Genetics lecture', lastWeek) })).toHaveCount(0)
    await expect(options.filter({ hasText: classLectureTitle('Genetics lecture', inTwoWeeks) })).toHaveCount(0)

    expect(await lectureOf(request, cls.id, nextWeek)).toMatchObject({ course: 'chemistry' })
    expect(await lectureOf(request, cls.id, lastWeek)).toMatchObject({ course: 'biology' })
    expect(await lectureOf(request, cls.id, inTwoWeeks)).toMatchObject({ course: 'biology' })
  })
})
