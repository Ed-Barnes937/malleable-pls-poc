// ---------------------------------------------------------------------------
// Shared, storage-agnostic workflow engine types.
//
// This package is PURE TypeScript domain logic + interfaces. It must never
// import sql.js, @pls/db, postgres, or react. Backends (substrate browser /
// server postgres) implement `StorageAdapter` and register their executors.
// ---------------------------------------------------------------------------

/**
 * A value that may be synchronous or asynchronous. Used on every
 * {@link StorageAdapter} method so a synchronous sql.js adapter and an async
 * postgres adapter both satisfy one interface; the core always `await`s the
 * result, which is a no-op for synchronous values.
 */
export type Awaitable<T> = T | Promise<T>

// ---------------------------------------------------------------------------
// Domain entities
// ---------------------------------------------------------------------------

export interface Workflow {
  id: string
  source_lens: string
  trigger_event: string
  condition_field: string | null
  condition_value: string | null
  enabled: boolean
}

export interface WorkflowJob {
  id: string
  workflow_id: string
  job_type: string
  params: Record<string, unknown>
  sort_order: number
  delay_ms: number
}

/**
 * A workflow bundled with its jobs. `jobs` MUST be returned pre-sorted by
 * `sort_order` (both backends already `ORDER BY sort_order`); the core does
 * not re-sort.
 */
export interface WorkflowWithJobs extends Workflow {
  jobs: WorkflowJob[]
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

/**
 * Execution record for a single job. `input`/`output` are decoded objects in
 * the core — JSON (de)serialization is an adapter responsibility (substrate
 * stores TEXT, postgres stores jsonb). `retry_count` defaults to 0; substrate
 * simply never increments it.
 */
export interface JobRun {
  id: string
  workflow_id: string
  workflow_job_id: string
  job_type: string
  status: JobStatus
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  error: string | null
  depth: number
  retry_count: number
  created_at: string
  started_at: string | null
  completed_at: string | null
}

// ---------------------------------------------------------------------------
// Events + executor contract
// ---------------------------------------------------------------------------

/** The cascade unit emitted by executors and re-dispatched by the engine. */
export interface WorkflowEvent {
  type: string
  payload: Record<string, unknown>
}

/**
 * The cross-backend executor result contract. Note: substrate's executors
 * also produce `affectedQueryKeys` — that field is intentionally NOT part of
 * the core result; substrate carries it via a separate channel (a local
 * executor wrapper / onEvent listener). See MIGRATION.md.
 */
export interface JobResult {
  output: Record<string, unknown>
  events?: WorkflowEvent[]
}

/**
 * Context passed to an executor. Carries the owning scope, the current cascade
 * depth, and the full job run record so executors get the owning
 * user/workspace explicitly instead of via magic `_userId` injection.
 */
export interface ExecutorContext {
  scopeId: string | null
  depth: number
  jobRun: JobRun
}

export type Executor = (
  input: Record<string, unknown>,
  ctx: ExecutorContext,
) => Promise<JobResult>

export interface ExecutorMeta {
  label: string
  category: string
}

export interface ExecutorRegistry {
  /** Throws on duplicate registration. */
  register(jobType: string, executor: Executor, meta: ExecutorMeta): void
  /** Throws on unknown job type. */
  execute(
    jobType: string,
    input: Record<string, unknown>,
    ctx: ExecutorContext,
  ): Promise<JobResult>
  has(jobType: string): boolean
  getAvailableTypes(): Array<{ type: string } & ExecutorMeta>
}

// ---------------------------------------------------------------------------
// Storage adapter — the ONLY thing backends implement
// ---------------------------------------------------------------------------

export interface EnqueueJobRunArgs {
  workflowId: string
  workflowJobId: string
  jobType: string
  input: Record<string, unknown>
  depth: number
  /** Server uses for backoff scheduling; substrate ignores. */
  retryCount?: number
}

/**
 * Replaces the old `WorkflowStore`. The ONLY thing backends implement. Every
 * method returns `Awaitable<T>` so sync (sql.js) and async (postgres) both
 * fit. It deliberately takes NO `tx`/`userId` parameters — the server adapter
 * closes over its own transaction/user context (e.g. a factory
 * `createPgAdapter({ sql, userId })` or a per-tick `withTx` wrapper), so the
 * core stays ignorant of transaction boundaries.
 *
 * JSON encode/decode of input/output is the adapter's job; the core hands and
 * receives plain objects.
 */
export interface StorageAdapter {
  // --- dispatch side ---
  getEffectiveWorkflows(
    triggerEvent: string,
    scopeId: string | null,
  ): Awaitable<WorkflowWithJobs[]>

  /** Returns the new job run id. */
  enqueueJobRun(args: EnqueueJobRunArgs): Awaitable<string>

  // --- runner side ---
  /**
   * Returns the batch of job runs to process this tick.
   * (postgres: `WHERE status='pending' AND run_after<=now() LIMIT n`;
   *  sql.js: `status='pending' LIMIT 5`.) Named "claim" to signal intent for a
   *  future atomic `SELECT ... FOR UPDATE SKIP LOCKED` implementation.
   */
  claimPendingJobRuns(): Awaitable<JobRun[]>

  updateJobRunStatus(
    id: string,
    status: JobStatus,
    output?: Record<string, unknown>,
    error?: string,
  ): Awaitable<void>

  // --- OPTIONAL hooks — the core feature-detects via `if (adapter.x)` ---

  /** Substrate-only dedup. When defined and it returns true, the job is skipped. */
  isDuplicate?(
    jobType: string,
    input: Record<string, unknown>,
  ): Awaitable<boolean>

  /**
   * Substrate maps this to `persistDb()`; postgres no-ops (tx auto-commits).
   * Called by the runner after each status change and by dispatch after
   * enqueues. Optional to keep postgres clean.
   */
  commit?(): Awaitable<void>
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export interface DispatchContext {
  scopeId: string | null
  depth?: number
}

export interface DispatchResult {
  enqueuedJobIds: string[]
}

export interface WorkflowEngineConfig {
  adapter: StorageAdapter
  maxDepth?: number
}

export interface WorkflowEngine {
  dispatch(event: WorkflowEvent, ctx: DispatchContext): Promise<DispatchResult>
  matchesCondition(
    workflow: WorkflowWithJobs,
    payload: Record<string, unknown>,
  ): boolean
}

// ---------------------------------------------------------------------------
// Job runner
// ---------------------------------------------------------------------------

/**
 * The single observation surface. The server's EventBus and substrate's query
 * invalidation both subscribe to this — neither is in the core.
 */
export type RunnerEvent =
  | { type: 'job:started'; jobRun: JobRun }
  | { type: 'job:completed'; jobRun: JobRun; result: JobResult }
  | { type: 'job:failed'; jobRun: JobRun; error: string }

export interface JobRunner {
  start(intervalMs?: number): void
  stop(): void
  processOnce(): Promise<void>
  isRunning(): boolean
  onEvent(listener: (event: RunnerEvent) => void): () => void
}

export interface JobRunnerConfig {
  adapter: StorageAdapter
  executors: ExecutorRegistry
  engine: WorkflowEngine
  scopeId: string | null
  pollIntervalMs?: number
  /**
   * Maximum retry attempts on executor failure. Defaults to 0, which is the
   * safest default for substrate (which has no backoff column and would
   * otherwise loop). The server passes a higher value.
   */
  maxRetries?: number
}
