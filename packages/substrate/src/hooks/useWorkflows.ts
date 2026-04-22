import { useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getWorkflowsForLens,
  getRecentJobRuns,
  getRunningJobCount,
  getPendingJobRuns,
  updateJobRunStatus,
  setWorkflowEnabled,
  createWorkspaceOverride,
} from '../queries/workflows'
import { executeJob } from '../workflows/executors'
import { dispatchWorkflows } from '../workflows/engine'
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
  const processingRef = useRef(false)

  const processJobs = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true

    try {
      const pending = getPendingJobRuns()
      if (pending.length === 0) return

      for (const job of pending) {
        updateJobRunStatus(job.id, 'running')
        persistDb()
        queryClient.invalidateQueries({ queryKey: ['job_runs'] })
        queryClient.invalidateQueries({ queryKey: ['job_runs_count'] })

        try {
          const input = job.input ? JSON.parse(job.input) : {}
          const result = await executeJob(job.job_type, input)

          updateJobRunStatus(job.id, 'completed', JSON.stringify(result.output))
          persistDb()

          for (const keys of result.affectedQueryKeys) {
            queryClient.invalidateQueries({ queryKey: keys })
          }

          if (result.eventType) {
            dispatchWorkflows(result.eventType, result.output, workspaceId, job.depth)
          }

          queryClient.invalidateQueries({ queryKey: ['job_runs'] })
          queryClient.invalidateQueries({ queryKey: ['job_runs_count'] })
        } catch (err) {
          updateJobRunStatus(job.id, 'failed', undefined, String(err))
          persistDb()
          queryClient.invalidateQueries({ queryKey: ['job_runs'] })
          queryClient.invalidateQueries({ queryKey: ['job_runs_count'] })
        }
      }
    } finally {
      processingRef.current = false
    }
  }, [queryClient, workspaceId])

  useEffect(() => {
    const interval = setInterval(processJobs, 1000)
    return () => clearInterval(interval)
  }, [processJobs])
}
