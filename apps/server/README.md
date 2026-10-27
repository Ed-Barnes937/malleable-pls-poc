# @pls/server

tRPC API, `/upload`, and the workflow job runner.

**One server per database.** On start the server marks every job run still `running` as failed (`failInterruptedJobs`, `src/workflows/job-runner.ts`), assuming a restart cut it off. A second server on the same database would fail the first one's live runs: keep Fly at one machine (`fly scale count 1`), and never point `dev:server` and `e2e:server` at the same `PG_DB`.

## AI (`AI_MODE`)

All AI goes through `AiDeps` (`src/ai/deps.ts`): a `Transcriber` and an
`LlmClient`, created once in `src/index.ts` and passed to executors
(`createServerExecutors`) and routers (`ctx.ai`). Nothing else constructs a
provider client.

| `AI_MODE` | `OPENROUTER_API_KEY` | Result |
|---|---|---|
| `live` | set | OpenRouter Whisper transcription + OpenRouter LLM (`OPENROUTER_LLM_MODEL`, default in `src/ai/openrouter.ts`) |
| anything else, or unset (default `mock`) | any | Deterministic fakes: canned transcript (the real script for the demo wav, see below), `fakeLlmFixtures` |
| `live` | missing or empty | Fakes (a startup line says why) |

The server logs which mode it is in at startup.

- **Env files:** only `pnpm dev:server` loads `apps/server/.env` (via `tsx --env-file-if-exists`). `start`, `migrate-and-start` and `e2e:server` never do.
- **Tests never hit a provider:** `vitest.setup.ts` and both Playwright configs force `AI_MODE=mock` and unset the key, `e2e:server` does the same, and `src/ai/deps.test.ts` asserts fakes are selected under test. Live clients are unit-tested with an injected `fetch`.
- **Guardrail for reused servers:** `/health` reports `aiMode`. e2e global setup and `scripts/browse.mts` refuse to run unless it is `mock`, so a running live `dev:server` can never be driven by tests.
- **Retries:** executors that call a paid provider register with `maxRetries: 0` (`ExecutorMeta`), so a timed-out call is never re-sent automatically; the student can retry by hand.
- **Live transcription limits:** webm and wav only (the formats verified live), up to 25 MB. Uploads also accept mp3/m4a/ogg, which transcribe in mock mode only. Each live call logs `[transcribe] ... cost=` and `[llm] task=... cost=`.

## Adding an LLM task

Define the task once, next to the feature that uses it (e.g. `src/ai/tasks/review-task.ts`). Input, prompt, schema and fake are type-checked together:

```ts
import { z } from 'zod'
import { defineLlmTask } from '../llm'

export const reviewTask = defineLlmTask({
  name: 'review-task',
  system: 'You write short, friendly study task titles for a student.',
  buildPrompt: (input: { moment: string }) => `Lecture moment the student found confusing:\n${input.moment}`,
  schema: z.object({ title: z.string(), minutes: z.number().int() }),
  // Deterministic and derived from the input, so mock-mode screenshots look real.
  fake: (input) => ({ title: `Review: ${input.moment.split('.')[0]}`, minutes: 20 }),
})
```

Then call it through the injected client: `const { title } = await ai.llm.run(reviewTask, { moment })`.

- The schema must suit strict structured output: an object root, every field required (use `.nullable()`, not `.optional()`), and no `default`, length or format constraints. `defineLlmTask` throws at definition time otherwise, so a bad schema fails the first test that imports it instead of only failing live.
- Live and fake replies both go through JSON parsing and `schema` validation.
- In tests, `createFakeLlmClient()` records `.calls` (task, input, built prompt) for assertions.
- Register it in `src/ai/tasks/index.ts` with a sample input (`llmTaskSample(task, (lecture) => input)`), so the live smoke test covers it. `src/ai/tasks/index.test.ts` scans all of `src` for `defineLlmTask(` and fails until you do (or if the task is not exported).

## Lecture AI jobs

| Job | Runs after | Writes |
|---|---|---|
| `ai:transcribe` | `recording:completed` | transcript segments; emits `recording:transcribed` |
| `ai:summarize-lecture` | `recording:transcribed` | a 3-line summary annotation on the recording (`LECTURE_SUMMARY_ANCHOR`), replacing any earlier one |
| `plan:review-task` | `tag:created` (label = confused) | a review to-do linked to the moment, filed under the lecture's course, placed by `@pls/scheduler`; emits `plan-item:created` |

The confusion automation's params (`durationMin`, `windowDays`, `timeZone`; see `packages/substrate/src/workflows/review-automation.ts`) are read when the job runs. `windowDays` = 1 means "by tomorrow": the review ends by the end of that local day, placed in the earliest free time in that window (`placeReviews` in `@pls/substrate`): at least an hour after the mark, inside the 09:00-22:00 study day, around every commitment and every other scheduled task with Help me plan's 10-minute gap, and only on a day with study time left (the default 2h a day; reviews count against it). Days use the stored IANA `timeZone`; it defaults to Europe/London until users have a time zone preference, and the sentence editor stores the browser's zone when the student edits it.

Editing the params (`workflows.patch`, or `workflows.update`) re-places the open, not-yet-started reviews the automation made that are still where it put them (`job_runs.output.plan_item_id` / `starts_at` are the record). Reviews the student moved, started or finished, and all commitments, never move.

**Boards:** writes made from a board (marks, notes, uploads, plan item changes) send its id, and automations are dispatched on that board, so a board copy (e.g. one switched off there) wins over the built-in one. The pg adapter stores the board with each job as `input._workspaceId` (next to `_userId`), and the runner cascades events a job raises on the same board (`scopeForJob`), so switching the summary off on a board works too.

The LLM only writes words (a review topic, summary lines); the fakes (via `keyPhrase` / `extractiveSummary` in `packages/substrate/src/text.ts`) derive them from the transcript so mock mode looks real. DB-backed tests: `TEST_DATABASE_URL=... pnpm test review-automation.db`.

## Demo lecture and the live smoke test

The prepared demo lecture lives in `demo/` at the repo root: the script text (`lecture-mitochondrial-dna.md`), the audio (`.wav`, 16 kHz mono) and its transcript fixture (`.segments.json`: one segment per paragraph with exact timings, plus the wav's sha256). Regenerate the audio and fixture together after editing the script, on macOS:

```sh
pnpm demo:make-lecture            # or: scripts/demo/make-lecture.sh Daniel
```

**Mock mode** returns that fixture, the real lecture text with its real timings, when an uploaded file's bytes hash to the demo wav (`src/ai/demo-lecture.ts`); any other upload gets the canned mock transcript. This is also the demo's fallback if live transcription is unavailable: run in mock mode and upload the demo wav.

**Live smoke test (Ed only, costs money):** checks every live AI call the demo makes before a demo. It transcribes the demo wav with OpenRouter Whisper, then runs each task registered in `src/ai/tasks/index.ts` once on that transcript, printing each result, the cost of each call and the total.

```sh
AI_MODE=live pnpm demo:live-smoke
```

It refuses to run unless `AI_MODE=live` is set on the command line (it checks before loading `apps/server/.env`, which is where it reads `OPENROUTER_API_KEY` and `OPENROUTER_LLM_MODEL` from). Agents and CI must never run it.

## Help me plan (`planning.autofill`)

Auto-fill advice for one week: `{ from, to, timeZone, studyMinPerDay, estimates? }` -> `{ order, trims, note }`. It loads the week's rows and the open unscheduled to-dos (every course), builds the same `planTasks` / `weekLayout` / `planCapacity` the Calendar uses (`@pls/substrate`'s `planning.ts`, which also owns `STUDY_DAY`, shared with the confusion automation), adds weak topics (moments marked confused or below 50 "how sure you feel"), and runs the `plan-autofill` LLM task (`src/ai/tasks/plan-autofill.ts`). The reply goes through `sanitizeAdvice`: every to-do ranked exactly once; trims via `completeTrims` (known to-dos only, clamped to fit in one day, at most two capacity trims, and every to-do longer than a day's study time guaranteed one); the note clipped and stripped of any sentence with an amount of time, since the numbers shown come from code.

It writes and places nothing. "AI suggests, code decides": the Calendar places the ghost blocks with `draftPlan` (`@pls/scheduler`, within the daily study budget), the capacity copy comes from `capacityCopy`, and only blocks the student accepts are saved (`planItems.update`). The mock reply ranks by due date, then weak topics, then shorter first, trims every to-do longer than a day (or the longest one when the week is short), and its note names only the first priority. DB-backed tests: `TEST_DATABASE_URL=... pnpm test planning.db`.

Accepted blocks are ordinary scheduled to-dos, so the confusion automation treats them as busy and never moves them (it only re-places reviews still where it put them).
