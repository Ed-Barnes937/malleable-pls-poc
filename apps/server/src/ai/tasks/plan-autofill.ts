import { z } from 'zod'
import { defaultTrims, formatMinutes, rankForPlan, type PlanAdvice, type PlanTask } from '@pls/substrate'
import { defineLlmTask } from '../llm'

export interface PlanAutofillTaskInput {
  /** Unscheduled to-dos to plan into the week. */
  tasks: PlanTask[]
  /** Study time left this week (free time capped per day), from `@pls/scheduler`'s `capacity`. */
  freeMin: number
  neededMin: number
  /** The student's study time per day: no to-do longer than this fits in one day. */
  minutesPerDay: number
  /** Short lecture moments the student found hard (confused, or low "how sure you feel"). */
  weakTopics: string[]
  /** IANA zone, for writing due times in the student's terms. */
  timeZone: string
}

function dueText(iso: string | null, timeZone: string): string {
  if (!iso) return 'no due date'
  return `due ${new Intl.DateTimeFormat('en-GB', {
    timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso))}`
}

/**
 * Help me plan's Auto-fill: the model only ranks the to-dos, may suggest
 * shrinking one or two when the week is over capacity, and writes one short
 * note. `@pls/scheduler` places every block, and the free / needed numbers
 * shown come from code (`capacityCopy`), never from this reply.
 */
export const planAutofillTask = defineLlmTask({
  name: 'plan-autofill',
  system: [
    'You help a university student plan study time for their week. Be calm, kind and honest; never guilt-trip.',
    'Rank every to-do id from most to least important: sooner due dates first, then weak topics, then quick wins.',
    'Only if the to-dos need more time than is left, or one is longer than a day\'s study time, suggest shrinking one or two of them',
    '(new length in minutes, a multiple of 15, shorter than now and no longer than a day\'s study time) with a short reason; otherwise return no trims.',
    'Write one short sentence (under 25 words) about the plan, without repeating the hour totals. Use the student\'s to-do names.',
  ].join(' '),
  buildPrompt: (input: PlanAutofillTaskInput) => [
    `Study time left this week: ${formatMinutes(input.freeMin)} (at most ${formatMinutes(input.minutesPerDay)} a day). The to-dos need: ${formatMinutes(input.neededMin)}.`,
    input.weakTopics.length > 0 && `Topics the student found hard:\n${input.weakTopics.map((t) => `- ${t}`).join('\n')}`,
    'To-dos:',
    ...input.tasks.map((t) => [
      `- id=${t.id}: "${t.title}"`,
      t.course && `(${t.course})`,
      `${t.durationMin} min${t.assumed ? ' (guessed)' : ''}`,
      dueText(t.dueAt, input.timeZone),
      t.weakTopic && '[weak topic]',
    ].filter(Boolean).join(', ')),
  ].filter(Boolean).join('\n'),
  schema: z.object({
    order: z.array(z.string()),
    trims: z.array(z.object({ taskId: z.string(), durationMin: z.number().int(), reason: z.string() })),
    note: z.string().nullable(),
  }),
  fake: (input): PlanAdvice => {
    const order = rankForPlan(input.tasks)
    const shortfall = Math.max(0, input.neededMin - input.freeMin)
    const first = input.tasks.find((t) => t.id === order[0])
    if (!first) return { order, trims: [], note: null }
    const lead = `${first.title} is due soonest, so it goes first.`
    const rest = shortfall > 0
      ? ` About ${formatMinutes(shortfall)} of to-dos won't fit as they are.`
      : ' The rest fits, with time to spare.'
    return { order, trims: defaultTrims(input.tasks, shortfall, input.minutesPerDay), note: first.dueAt ? lead + rest : rest.trim() }
  },
  maxTokens: 400,
})
