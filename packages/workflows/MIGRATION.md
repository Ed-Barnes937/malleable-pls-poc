# Migrating consumers onto `@pls/workflows`

The shared core is storage-agnostic: it owns dispatch matching, the depth/cycle
guard, the cascade, the runner poll loop, the status state machine, and the
retry decision. Backends own everything DB- and side-effect-specific by
implementing a single `StorageAdapter` and registering their executors against
`createExecutorRegistry()`.

```
StorageAdapter  (you implement)        Core (this package)
─────────────────────────────         ─────────────────────────────
getEffectiveWorkflows                  createWorkflowEngine().dispatch
enqueueJobRun                          createJobRunner().processOnce / start / stop / onEvent
claimPendingJobRuns                    createExecutorRegistry()
updateJobRunStatus
isDuplicate?  (optional)
commit?       (optional)
```

Key rules the adapter must honour:

- **Async-tolerant.** Every method returns `Awaitable<T>`. A synchronous
  (sql.js) adapter may return plain values; an async (postgres) adapter may
  return promises. The core always `await`s.
- **No `tx` / `userId` parameters.** The adapter closes over its own
  transaction / user context. The core never sees a transaction boundary.
- **JSON is the adapter's job.** The core hands and receives plain objects;
  the adapter (de)serializes `input`/`output` for its column type.
- **`jobs` arrive pre-sorted** by `sort_order`. The core does not re-sort.
- **Cascade depth:** the runner cascades at `job.depth`; `engine.dispatch`
  adds `+1` on enqueue, so a child lands at `job.depth + 1`. (See the bug note
  below.)

---

## Substrate (sql.js, browser)

Target: `createSqlJsAdapter()` in `packages/substrate/src/workflows/`, wrapping
the existing `queries/workflows.ts` + `db.ts`.

**Steps**

1. Add `@pls/workflows` as a dependency.
2. Write `createSqlJsAdapter()` implementing `StorageAdapter` by delegating to
   the existing `queries/workflows.ts` functions. Synchronous returns satisfy
   `Awaitable<T>` directly.
   - `getEffectiveWorkflows` -> the existing SELECTs incl. the
     workspace-override dedup/grouping.
   - `enqueueJobRun` -> the existing INSERT (`JSON.stringify` the input).
   - `claimPendingJobRuns` -> the current `getPendingJobRuns`
     (`status='pending' LIMIT 5`), `JSON.parse` input/output.
   - `updateJobRunStatus` -> the current update.
   - `isDuplicate` -> map to the current `(jobType, target_id)` dedup check.
   - `commit` -> map to `persistDb()`.
3. Register the five existing executors into `createExecutorRegistry()`. Wrap
   them to **drop `affectedQueryKeys` from the core `JobResult`** while
   preserving the keys for invalidation (closure / side table), and to return
   `events: WorkflowEvent[]` instead of the current `eventType` string.
4. Rewrite `useJobRunner` to construct `engine` + `runner` from the package and
   drive `processOnce` on the 1s interval. Subscribe to `runner.onEvent` to do
   `queryClient.invalidateQueries`. The simplest fallback is coarse
   invalidation (`['job_runs']` plus affected tables) on every `job:completed`.
   All React / `useQuery` code stays 100% in substrate.
5. Replace local `dispatchWorkflows` / `matchesCondition` with
   `engine.dispatch({ type, payload }, { scopeId })`.
6. Delete `substrate/src/workflows/engine.ts` once callers are migrated.
7. Manually verify the browser app still transcribes / cascades; check the
   depth fix fallout (children now land at `depth + 1`).

**Defaults:** leave `maxRetries` at `0` — substrate has no backoff/run_after
column and would otherwise re-enqueue instantly.

---

## Server (postgres, node)

Target: `createPgAdapter({ sql })` producing a per-tx adapter, or a `withTx`
helper that binds an adapter to a `TransactionSql` + `userId`.

**Steps**

1. Add `@pls/workflows` as a dependency.
2. Write `createPgAdapter` binding a `TransactionSql` + `userId`, implementing
   `StorageAdapter` (port `pg-store.ts` SQL verbatim):
   - `getEffectiveWorkflows` -> the `json_agg` workflow join, scoped by
     `WHERE user_id = ...` and RLS `set_config('app.current_user_id', ...)`.
   - `enqueueJobRun` -> INSERT; keep the **backoff** here:
     `run_after = now() + (2 ^ retryCount) * 1000ms`.
   - `claimPendingJobRuns` -> `WHERE status='pending' AND run_after<=now()
     LIMIT 5`.
   - `updateJobRunStatus` -> the per-status UPDATE case.
   - `commit` -> omit (tx auto-commits).
3. Register the five executors into `createExecutorRegistry()`.
4. Keep the outer "distinct users with pending jobs" + `sql.begin` loop in
   `job-runner.ts`, but inside each `begin` build the core `engine` + `runner`
   on the per-tx adapter and call `processOnce()` once. The **retry decision**
   moves to the core (`maxRetries`); only the backoff delay stays in the
   adapter.
5. Subscribe to `runner.onEvent` to call `emitEvent` — translate
   `job:completed` / `job:failed` `RunnerEvent`s into `ServerEvent`s (adding
   `userId` / table). `emitEvent` and the EventBus stay in `events.ts`.
6. Replace `dispatch.ts` `dispatchWorkflows` with
   `engine.dispatch({ type, payload }, { scopeId: workspaceId })`.
7. Keep tRPC routers as-is (they only read).
8. Run server tests and a manual transcription end-to-end.

**Behaviour normalization to flag in review:** unknown job types now throw in
the registry and become the standard runner failure path
(`failed` + "Unknown job type: x"), replacing the server's inline `failed`
write and substrate's error-output return.

---

## The depth bug this consolidation fixes

Both backends previously re-dispatched cascades at `job.depth` **and** the
engine incremented depth on enqueue — but they did so inconsistently relative
to each other, so a chain could (in)correctly hit `MAX_DEPTH=3` on one backend
and not the other. The canonical core standardizes on **cascade at
`job.depth`, engine adds `+1`**, covered by a regression test in
`job-runner.test.ts`. Re-verify each backend's longest chain after migrating.

---

## Risks

- **Async vs sync execution.** Making every adapter method `Awaitable<T>` and
  awaiting in the core is safe for sql.js (sync values await to themselves) but
  turns substrate's previously-synchronous `dispatch` into async. Any caller
  that relied on synchronous ids must handle a Promise. Low risk (callers are
  in a poll loop) but verify during the substrate migration.
- **Transaction boundary leakage.** The server processes all of one user's
  pending jobs (and cascades) inside a single `sql.begin`. A long executor
  (AssemblyAI upload) holding a tx open can exhaust the pool. This already
  exists today; consolidation must not make it worse. May warrant moving
  executor I/O outside the tx later.
- **Event/cascade model mismatch.** Substrate cascades on an executor-set
  `eventType` string reusing `output` as payload; the server cascades on a
  structured `events[]`. The core standardizes on `events[]`. Substrate
  executors must be adapted to return `events[]` or a shim must translate —
  otherwise substrate cascades silently stop firing.
- **Depth inconsistency (latent bug).** Standardizing on "cascade at
  `job.depth`, engine adds +1" changes the effective depth at which substrate
  children run, which could enable or disable a chain that currently
  (in)correctly hits `MAX_DEPTH=3`. Needs a per-backend regression test.
- **`affectedQueryKeys` is substrate-only.** Dropping it from the core
  `JobResult` means substrate loses fine-grained invalidation unless it keeps a
  side channel. Coarse invalidation is the easy fallback but is a behaviour
  regression (more refetching).
- **Duplicate registration throws.** Hot-reload or test re-imports that
  register twice now crash where the static Record/Map previously silently
  overwrote. Needs a guard or idempotent register in dev.
- **Retry semantics divergence.** Only the server has `retry_count` /
  `run_after`. Putting the retry decision in the core means substrate's adapter
  must accept `retryCount` in `enqueue` and at least store/ignore
  `retry_count`. Default `maxRetries=0` for substrate is safest.

---

## Open questions

- **`commit?()` on the adapter, or substrate debounces `persistDb` via
  `onEvent`?** The `onEvent` route keeps the interface smaller and avoids a
  localStorage write per status change. Decide before locking the interface.
- **Per-(user,tx) construction of engine+runner on the server** vs a single
  long-lived engine with context-receiving adapter methods. The former keeps
  the core tx-ignorant (preferred); confirm perf at the 2s / 20-user batch.
- **`scopeId` as a single opaque string** vs a structured object, given the
  server needs two scoping dimensions (`user_id` for RLS + `workspace_id` for
  overrides). Proposed: adapter closes over `userId`, `scopeId` carries
  `workspaceId`. Confirm it covers all server queries.
- **Standardize on `ExecutorContext`** and deprecate injected
  `_userId`/`_delayMs`, or keep injection for backward compat during migration?
  Affects whether the five executors need touching in step one.
- **Should `claimPendingJobRuns` actually CLAIM** (atomic flip to a claimed
  state, `SELECT ... FOR UPDATE SKIP LOCKED`) for multi-worker safety, or stay
  a plain SELECT? Only matters if the server runs >1 instance; current design
  assumes single-instance. The name signals intent.
- **Where do the five executors live** — duplicated per backend (different
  bodies: real AssemblyAI vs mocked sql.js) or a shared interface with
  backend-specific impls? They are genuinely backend-specific, so probably stay
  per-consumer; confirm we share only the registry, not executor bodies.
