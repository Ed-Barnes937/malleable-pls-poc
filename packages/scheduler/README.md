# @pls/scheduler

Pure, deterministic placement of study time around a student's week. No DB,
no AI, no clock, no framework, no dependencies: "now" is always a parameter
and the same inputs always give the same output.

It is the "code decides" half of *AI suggests, code decides*: an LLM may rank
or trim to-dos, this package decides where they go in time. Commitments are
never moved.

## Model

- **Times** are UTC epoch milliseconds (`number`). Convert with
  `date.getTime()` / `new Date(ms)` at the edges.
- **Intervals** are half-open `{ start, end }`. Everything returned is
  normalized: sorted, disjoint, non-empty.
- **Time zones:** the study day (`dayStart`/`dayEnd`) is read in an IANA
  time zone (`timeZone`, default `'UTC'`) via the built-in
  `Intl.DateTimeFormat`, so "08:00" stays 08:00 local across DST changes.
  We chose an IANA zone over a caller-supplied offset function because it is
  one serializable string (easy to store as a user pref), and it gets DST
  right without callers writing date code. DST rule, in every zone (same as
  JS `Date` / Temporal `'compatible'`): a wall time inside a spring-forward
  gap moves later by the gap (02:30 becomes 03:30); a fall-back time that
  happens twice resolves to the earlier instant.
- **Inputs are structural**, not substrate types. Callers map their data on:
  - commitments (classes, shifts; recurrences already expanded) -> `Interval[]`
  - to-dos -> `SchedulerTask { id, durationMin, earliest?, latest? }`
    (`latest` = must end by, e.g. `due_at` or "within 3 days")
  - accepted / already scheduled blocks -> `ExistingPlacement { start, end, taskId? }`

## API

| Function | What it does |
|---|---|
| `freeSlots(commitments, range, prefs?)` | Study-day windows in `range` minus commitments (padded by `bufferMin`), keeping gaps of at least `minSlotMin`. Defaults: `08:00`-`22:00`, UTC, 15 min, no buffer. |
| `place(tasks, freeSlots, { now, existingPlacements?, policy?, anchor?, alignMin? })` | One contiguous block per task, earliest-fit (or latest-fit with `anchor: 'latest'`). Returns `{ placements, unplaced: [{ taskId, reason }] }`. |
| `suggestSlots(task, freeSlots, n, { now, existingPlacements?, anchor?, alignMin? })` | Up to `n` candidate blocks, one per separate free gap, in the anchor's preference order (the first is where `place` would put it). |
| `capacity(freeSlots, tasks, { now, existingPlacements? })` | `{ freeMin, neededMin, shortfallMin, spareMin, fits }`. Free time before `now` is not counted, so a whole week's `freeSlots` is fine mid-week. |
| `refit(blocks, freeSlots, { now, ... })` | Re-places blocks that ended before `now` (the caller says which were not done). Blocks that have not ended stay put and count as busy. Returns `place`'s result plus `notMissed`. |
| `startOfLocalDay(instant, timeZone, addDays?)` | Local midnight, e.g. "by end of tomorrow" = `startOfLocalDay(now, tz, 2)`. |
| `normalize`, `subtract`, `totalMinutes`, `dayWindows`, `zonedTimeToUtc`, `wallClock` | Building blocks, exported for UIs. |

Rules `place` guarantees (property-tested):

- every block lies inside `freeSlots`, so never overlaps a commitment;
- never overlaps a fixed existing placement or another new block;
- starts at or after `max(now, earliest)`, ends by `latest`;
- starts on a multiple of `alignMin` (default 15, so :00/:15/:30/:45 in every
  real time zone);
- places each task `id` at most once (later repeats are `'duplicate-id'`);
- deterministic, and idempotent: feeding its result back in as
  `existingPlacements` returns the same placements.

**Priority:** with the default `policy: 'priority'`, tasks get first pick of
free time in the order you pass them (so an AI ranking can decide what
matters). `policy: 'deadline'` sorts by `latest` instead (stable).

**Anchor:** `anchor: 'earliest'` (default) takes the earliest fit;
`'latest'` takes the latest fit that still ends by the task's `latest`, e.g.
a spaced review that lets a lecture settle. With `'latest'`, a task with no
`latest` goes at the end of the supplied free time.

**Moving a task:** an existing placement whose `taskId` is one of the tasks
being placed is ignored, so that task can move. Every other existing
placement is fixed. So a block is movable if and only if its task id is in
`tasks`: **never pass a task whose block the student accepted or dragged**
unless you mean to move it. Leave it out of `tasks` and pass its block in
`existingPlacements`.

**Unplaced reasons:** `'invalid-duration'`, `'window-closed'` (not enough time
between `max(now, earliest)` and `latest` even with an empty calendar),
`'no-free-slot'` (the window is open but busy or fragmented), `'duplicate-id'`
(another task with the same id was considered first).

`capacity().fits` is necessary, not sufficient (free time can be fragmented or
outside a window). Use `place` for the truth and `capacity` for the copy.

## Examples

```ts
import { capacity, freeSlots, place, refit, startOfLocalDay, suggestSlots } from '@pls/scheduler'

const tz = 'Europe/London'
const week = { start: weekStart.getTime(), end: weekEnd.getTime() }
const free = freeSlots(commitments, week, { timeZone: tz, bufferMin: 10 })

// T7: "add a 20-min review within 3 days" around classes, shifts and accepted blocks,
// late in the window so the lecture has time to settle.
const { placements, unplaced } = place(
  [{ id: item.id, durationMin: 20, latest: now + 3 * 24 * 60 * 60_000 }],
  free,
  { now, existingPlacements: acceptedBlocks, anchor: 'latest' },
)

// T7: automation edited to "30 min by tomorrow" - pass the old block in; the task moves.
// Only pass tasks that are still open and not accepted: anything in `tasks` may move.
place([{ id: item.id, durationMin: 30, latest: startOfLocalDay(now, tz, 2) }], free, {
  now,
  existingPlacements: [...acceptedBlocks, ...placements],
  anchor: 'latest',
})

// T9: Help me plan. `capacity` ignores free time before `now`.
const c = capacity(free, todos, { now, existingPlacements: acceptedBlocks })
// `About ${Math.round(c.freeMin / 60)} free hours. This needs ${Math.round(c.neededMin / 60)}.`
const options = suggestSlots(todo, free, 3, { now, existingPlacements: acceptedBlocks })
const ghosts = place(aiRankedTodos, free, { now, existingPlacements: acceptedBlocks })

// T10: re-fit blocks that were not done; any that have not ended yet stay put and are busy.
const refitted = refit(notDoneBlocks, freeSlots(commitments, { start: now, end: week.end }), {
  now,
  existingPlacements: acceptedBlocks,
})
```

`src/demo-week.test.ts` runs these scenarios against the demo week.

## Tests

`pnpm test` runs them; `pnpm test:coverage` enforces >= 95% branch and 100%
line/function coverage for this package (see `vitest.config.ts`).
