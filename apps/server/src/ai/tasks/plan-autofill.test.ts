import { describe, expect, it } from 'vitest'
import type { PlanTask } from '@pls/substrate'
import { createFakeLlmClient } from '../fake-llm'
import { planAutofillTask } from './plan-autofill'

const task = (id: string, title: string, durationMin: number, dueAt: string | null, extra: Partial<PlanTask> = {}): PlanTask =>
  ({ id, title, course: null, dueAt, durationMin, assumed: false, weakTopic: false, latest: Date.UTC(2026, 10, 9), ...extra })

const tasks = [
  task('reading', 'Chemistry reading', 180, null),
  task('lab', 'Lab report write-up', 240, '2026-11-06T17:00:00.000Z'),
  task('quiz', 'Biology quiz prep', 120, '2026-11-05T09:00:00.000Z', { assumed: true }),
]

describe('plan-autofill (mock)', () => {
  it('ranks by due date, suggests trims and writes an honest note when over capacity', async () => {
    const llm = createFakeLlmClient()
    const advice = await llm.run(planAutofillTask, { tasks, freeMin: 540, neededMin: 720, minutesPerDay: 180, weakTopics: [], timeZone: 'Europe/London' })
    expect(advice.order).toEqual(['quiz', 'lab', 'reading'])
    expect(advice.trims).toEqual([expect.objectContaining({ taskId: 'lab', durationMin: 120 })])
    expect(advice.note).toBe("Biology quiz prep is due soonest, so it goes first. About 3h of to-dos won't fit as they are.")
    // The prompt carries the code's numbers and the to-dos in the student's words.
    const [{ prompt }] = llm.calls
    expect(prompt).toContain('Study time left this week: 9h (at most 3h a day). The to-dos need: 12h.')
    expect(prompt).toContain('- id=quiz: "Biology quiz prep", 120 min (guessed), due Thu 5 Nov, 09:00')
  })

  it('says it fits, without trims, when there is room', async () => {
    const advice = planAutofillTask.fake({ tasks: [tasks[0]], freeMin: 900, neededMin: 180, minutesPerDay: 240, weakTopics: [], timeZone: 'UTC' })
    expect(advice).toEqual({ order: ['reading'], trims: [], note: 'The rest fits, with time to spare.' })
    expect(planAutofillTask.fake({ tasks: [], freeMin: 0, neededMin: 0, minutesPerDay: 120, weakTopics: [], timeZone: 'UTC' }))
      .toEqual({ order: [], trims: [], note: null })
  })
})
