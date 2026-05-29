import { useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createWorkflowEngine, createJobRunner } from '@pls/workflows'
import type { RunnerEvent } from '@pls/workflows'
import {
  getWorkflowsForLens,
  getRecentJobRuns,
  getRunningJobCount,
  setWorkflowEnabled,
  createWorkspaceOverride,
} from '../queries/workflows'
import { createSqlJsAdapter } from '../workflows/sql-js-adapter'
import { createSubstrateExecutorRegistry, AFFECTED_QUERY_KEYS } from '../workflows/executors'
import { persistDb } from '../db'
import type { WorkflowWithJobs } from '../types'

export function useWorkflowsForLens(sourceLens: string, workspaceId: string | null) {
  return useQuery({
    queryKey: ['workflows', sourceLens, workspaceId],
    queryFn: () => getWorkflowsForLens(sourceLens, workspaceId),
  })
}

export function useRecentJobs(limit = 20) {
  return useQuery({
    queryKey: ['job_runs', limit],
    queryFn: () => getRecentJobRuns(limit),
  })
}

export function useRunningJobCount() {
  return useQuery({
    queryKey: ['job_runs_count'],
    queryFn: () => getRunningJobCount(),
    refetchInterval: 1000,
  })
}

export function useToggleWorkflow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ workflowId, enabled }: { workflowId: string; enabled: boolean }) => {
      setWorkflowEnabled(workflowId, enabled)
      persistDb()
      return Promise.resolve()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })
}

export function useCreateWorkspaceOverride() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      defaultWorkflow,
      workspaceId,
    }: {
      defaultWorkflow: WorkflowWithJobs
      workspaceId: string
    }) => {
      const id = createWorkspaceOverride(defaultWorkflow, workspaceId)
      persistDb()
      return Promise.resolve(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })
}

export function useJobRunner(workspaceId: string) {
  const queryClient = useQueryClient()

  // Build the core engine + runner from `@pls/workflows`. `scopeId` carries
  // the opaque substrate workspace id (LOCKED DECISION 2). The sql.js adapter
  // maps `commit()` -> `persistDb()` (LOCKED DECISION 1) and
  // `claimPendingJobRuns` -> a plain SELECT (LOCKED DECISION 3). `maxRetries`
  // is 0 for substrate (no backoff column).
  const runner = useMemo(() => {
    const adapter = createSqlJsAdapter()
    const executors = createSubstrateExecutorRegistry()
    // The runner closes over the engine; cascades dispatch via
    // `engine.dispatch({ type, payload }, { scopeId })` internally, replacing
    // the old local `dispatchWorkflows` / `matchesCondition`.
    const engine = createWorkflowEngine({ adapter })
    return createJobRunner({
      adapter,
      executors,
      engine,
      scopeId: workspaceId,
      maxRetries: 0,
    })
  }, [workspaceId])

  // Subscribe for query invalidation. COARSE invalidation on `job:completed`
  // (LOCKED DECISION 5): always invalidate ['job_runs'] + ['job_runs_count'],
  // plus the domain tables the executor's job_type is known to touch.
  // TODO: this is coarser than the old per-key invalidation, which used the
  // concrete `affectedQueryKeys` the executor returned for that specific run.
  // Could be made fine-grained again via a side channel later.
  useEffect(() => {
    const unsubscribe = runner.onEvent((event: RunnerEvent) => {
      if (event.type === 'job:started') {
        queryClient.invalidateQueries({ queryKey: ['job_runs'] })
        queryClient.invalidateQueries({ queryKey: ['job_runs_count'] })
        return
      }

      // job:completed | job:failed
      queryClient.invalidateQueries({ queryKey: ['job_runs'] })
      queryClient.invalidateQueries({ queryKey: ['job_runs_count'] })

      if (event.type === 'job:completed') {
        const affected = AFFECTED_QUERY_KEYS[event.jobRun.job_type] ?? []
        for (const keys of affected) {
          queryClient.invalidateQueries({ queryKey: keys })
        }
      }
    })
    return unsubscribe
  }, [runner, queryClient])

  // Drive processOnce on the existing ~1s interval.
  useEffect(() => {
    const interval = setInterval(() => {
      void runner.processOnce()
    }, 1000)
    return () => clearInterval(interval)
  }, [runner])
}
