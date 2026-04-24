import type { Executor, ExecutorMeta, ExecutorRegistry, JobResult } from './types'

interface Entry {
  executor: Executor
  meta: ExecutorMeta
}

export function createExecutorRegistry(): ExecutorRegistry {
  const entries = new Map<string, Entry>()

  return {
    register(jobType, executor, meta) {
      if (entries.has(jobType)) {
        throw new Error(`Executor for job type "${jobType}" is already registered`)
      }
      entries.set(jobType, { executor, meta })
    },

    async execute(jobType, input): Promise<JobResult> {
      const entry = entries.get(jobType)
      if (!entry) {
        throw new Error(`Unknown job type: ${jobType}`)
      }
      return entry.executor(input)
    },

    getAvailableTypes() {
      return Array.from(entries.entries()).map(([type, { meta }]) => ({
        type,
        label: meta.label,
        category: meta.category,
      }))
    },

    has(jobType) {
      return entries.has(jobType)
    },
  }
}
