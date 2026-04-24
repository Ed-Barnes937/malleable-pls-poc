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

export interface WorkflowWithJobs extends Workflow {
  jobs: WorkflowJob[]
}

export interface JobRun {
  id: string
  workflow_id: string
  workflow_job_id: string
  job_type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  error: string | null
  depth: number
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface JobResult {
  output: Record<string, unknown>
  events?: Array<{ type: string; payload: Record<string, unknown> }>
}

export interface WorkflowStore {
  getEffectiveWorkflows(triggerEvent: string, scopeId: string | null): WorkflowWithJobs[]
  getPendingJobRuns(): JobRun[]
  enqueueJobRun(
    workflowId: string,
    workflowJobId: string,
    jobType: string,
    input: Record<string, unknown>,
    depth: number,
  ): string
  updateJobRunStatus(
    id: string,
    status: JobRun['status'],
    output?: Record<string, unknown>,
    error?: string,
  ): void
}

export type Executor = (input: Record<string, unknown>) => Promise<JobResult>

export interface ExecutorMeta {
  label: string
  category: string
}

export interface ExecutorRegistry {
  register(jobType: string, executor: Executor, meta: ExecutorMeta): void
  execute(jobType: string, input: Record<string, unknown>): Promise<JobResult>
  getAvailableTypes(): Array<{ type: string } & ExecutorMeta>
  has(jobType: string): boolean
}

export interface DispatchResult {
  enqueuedJobIds: string[]
}

export interface WorkflowEngineConfig {
  store: WorkflowStore
  executors: ExecutorRegistry
  maxDepth?: number
}

export interface WorkflowEngine {
  dispatch(
    eventType: string,
    payload: Record<string, unknown>,
    scopeId: string | null,
    depth?: number,
  ): DispatchResult
  matchesCondition(workflow: WorkflowWithJobs, payload: Record<string, unknown>): boolean
}

export type JobRunnerEvent =
  | { type: 'job:started'; jobRun: JobRun }
  | { type: 'job:completed'; jobRun: JobRun; result: JobResult }
  | { type: 'job:failed'; jobRun: JobRun; error: string }

export interface JobRunner {
  start(intervalMs?: number): void
  stop(): void
  processOnce(): Promise<void>
  isRunning(): boolean
  onEvent(listener: (event: JobRunnerEvent) => void): () => void
}

export interface JobRunnerConfig {
  store: WorkflowStore
  executors: ExecutorRegistry
  engine: WorkflowEngine
  scopeId: string | null
}
