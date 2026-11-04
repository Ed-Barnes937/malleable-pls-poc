import { test, expect } from '@playwright/test'
import type { PlanItem } from '../packages/substrate/src'
import { CalendarPom, TopBarPom } from './pom'
import { reseed } from './reseed'
import { trpcMutation, trpcQuery } from './api'
import { SEED_TIME_ZONE } from './seed-week'

/**
 * Auto-fill respects deadlines (flow audit 01a), mock AI, on Priya's seeded
 * week on a Wednesday evening: dated to-dos go first, soonest due first, a
 * to-do that fits in no single block is split into sessions before it is
 * due, and nothing is drafted across a due time. Seed and browser share one
 * frozen "now" (the server only ranks; the draft is placed in the browser).
 */
const NOW = Date.parse('2026-10-28T20:40:00Z') // Wed 28 Oct 2026, 20:40 London (GMT)

test.use({ viewport: { width: 1440, height: 900 }, timezoneId: SEED_TIME_ZONE })

test.describe('Auto-fill and deadlines', () => {
  test.beforeEach(async () => { await reseed({ now: NOW }) })
  test.afterAll(async () => { await reseed() })

  test('on Wednesday evening it books the quiz revision before Thursday 10:00 and the lab report across Thursday and Friday', async ({ page, request }) => {
    await page.clock.setFixedTime(NOW)
    const ws = await trpcMutation<{ id: string }>(request, 'workspaces.create', { name: 'My week' })
    await trpcMutation(request, 'workspaces.addPanel', {
      workspaceId: ws.id, lensType: 'calendar', slotName: 'calendar', pos_x: 24, pos_y: 24, width: 1100, height: 680,
    })
    await page.goto('/')
    await new TopBarPom(page).switchToWorkspace('My week')
    const calendar = new CalendarPom(page)
    await expect(calendar.grid).toBeVisible()

    await calendar.root.getByTestId('help-me-plan').click()
    const plan = calendar.root.getByTestId('help-me-plan-panel')
    await plan.getByTestId('autofill').click()
    const draft = plan.getByTestId('autofill-draft')
    await expect(draft).toBeVisible({ timeout: 15000 })

    const ghost = (title: string) => calendar.root.getByTestId('calendar-ghost').filter({ hasText: title })
    // Tonight's study time, then Thursday morning before the quiz at 10:00.
    await expect(ghost('Revise for the Biology quiz (1 of 2)')).toHaveAttribute('aria-label', /20:45 - 22:00/)
    await expect(ghost('Revise for the Biology quiz (2 of 2)')).toHaveAttribute('aria-label', /09:00 - 09:45/)
    // After the quiz (never across 10:00), then Friday before it is due at 17:00.
    await expect(ghost('Lab report write-up (1 of 2)')).toHaveAttribute('aria-label', /10:15 - 11:30/)
    await expect(ghost('Lab report write-up (2 of 2)')).toHaveAttribute('aria-label', /09:00 - 10:45/)
    await expect(draft.getByTestId('autofill-block').filter({ hasText: 'Revise for the Biology quiz' })).toHaveText([
      /Revise for the Biology quiz \(1 of 2\)/, /Revise for the Biology quiz \(2 of 2\)/,
    ])

    await plan.getByRole('button', { name: 'Accept draft' }).click()
    await expect(calendar.root.getByTestId('calendar-ghost')).toHaveCount(0)

    // Each session is its own study block linked to its to-do; the to-do keeps its total.
    const rows = await trpcQuery<PlanItem[]>(request, 'planItems.list', {})
    const quiz = rows.find((r) => r.id === 'seed-todo-quiz-revision')!
    const lab = rows.find((r) => r.id === 'seed-todo-lab-write-up')!
    expect(quiz).toMatchObject({ starts_at: null, duration_min: 120, status: 'open' })
    expect(lab).toMatchObject({ starts_at: null, duration_min: 180, status: 'open' })
    const sessions = (todo: PlanItem) => rows.filter((r) => r.source_type === 'plan_item' && r.source_id === todo.id)
    for (const todo of [quiz, lab]) {
      const own = sessions(todo)
      expect(own).toHaveLength(2)
      expect(own.reduce((sum, s) => sum + s.duration_min!, 0)).toBe(todo.duration_min)
      for (const s of own) expect(Date.parse(s.ends_at!)).toBeLessThanOrEqual(Date.parse(todo.due_at!))
    }
    // Nothing runs across a due time on the calendar.
    const dues = rows.filter((r) => r.due_at && r.status !== 'dismissed').map((r) => Date.parse(r.due_at!))
    for (const block of rows.filter((r) => r.kind === 'task' && r.starts_at && Date.parse(r.starts_at) >= NOW)) {
      for (const due of dues) {
        expect(Date.parse(block.starts_at!) < due && due < Date.parse(block.ends_at!), `${block.title} runs across a due time`).toBe(false)
      }
    }
    await expect(calendar.block('Lab report write-up')).toHaveCount(2)
    await expect(calendar.block('Revise for the Biology quiz')).toHaveCount(2)
  })
})
