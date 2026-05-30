# @pls/workflows

Storage-agnostic workflow engine: pure TypeScript domain logic and a
`StorageAdapter` interface implemented by backends.

## Overview

Provides the types, registry, engine, and job runner for workflows that react
to domain events (e.g. `tag:created`, `confidence:recorded`). Workflows match
conditions on event payloads and dispatch jobs that can themselves trigger
further workflows, with depth limiting to prevent infinite cascades.

This package is **pure**: it has **no dependency** on sql.js, `@pls/db`,
postgres, or react. Backends implement a single `StorageAdapter` and register
their executors against `createExecutorRegistry()`. See
[MIGRATION.md](./MIGRATION.md) for how each consumer (substrate browser, server
postgres) adopts the core via an adapter.

## Architecture

```
Backend implements StorageAdapter        Core (this package)
──────────────────────────────────       ──────────────────────────────────
getEffectiveWorkflows                     createWorkflowEngine().dispatch
enqueueJobRun                             createJobRunner().processOnce/start/onEvent
claimPendingJobRuns                       createExecutorRegistry()
updateJobRunStatus
isDuplicate?  (optional, substrate)
commit?       (optional, substrate)
```

- Every adapter method returns `Awaitable<T>` so a synchronous sql.js adapter
  and an async postgres adapter satisfy one interface.
- The adapter owns transactions, `userId` scoping, JSON (de)serialization, and
  backend side-effects. The core stays ignorant of all of them.
- Side effects (substrate React-Query invalidation, server EventBus) are
  consumers of `runner.onEvent` and live entirely outside the core.

## Key exports

### Types

| Type | Description |
|------|-------------|
| `Awaitable<T>` | `T \| Promise<T>` — lets sync and async adapters share one interface |
| `Workflow` / `WorkflowJob` / `WorkflowWithJobs` | Workflow definition + its (pre-sorted) jobs |
| `JobRun` / `JobStatus` | Execution record + status literal union |
| `WorkflowEvent` | The cascade unit (`{ type, payload }`) |
| `JobResult` | Executor result (`{ output, events? }`) |
| `Executor` / `ExecutorContext` / `ExecutorMeta` | Executor contract (ctx carries `scopeId`, `depth`, `jobRun`) |
| `ExecutorRegistry` | Map-based registry of job types -> executors |
| `StorageAdapter` | The single interface backends implement |
| `WorkflowEngine` / `DispatchContext` / `DispatchResult` | Async dispatcher |
| `JobRunner` / `RunnerEvent` | Poll loop + observation surface |

### Factories

| Function | Description |
|----------|-------------|
| `createExecutorRegistry()` | New executor registry (throws on duplicate / unknown type) |
| `createWorkflowEngine({ adapter, maxDepth? })` | Async `dispatch` + `matchesCondition` (default depth 3) |
| `createJobRunner({ adapter, executors, engine, scopeId, pollIntervalMs?, maxRetries? })` | Poll/process/start/stop/onEvent |
| `createMemoryAdapter(seed?)` | A tiny in-memory `StorageAdapter` for tests (exported from the root) |

## Testing helper

`createMemoryAdapter()` is a synchronous, DB-free `StorageAdapter` used by this
package's own tests and exportable for consumers' tests. It also demonstrates
that a synchronous adapter satisfies the `Awaitable<T>` contract.
