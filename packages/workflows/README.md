# @pls/workflows

Workflow engine for automated task execution and event-driven job cascading.

## Overview

Provides the types, registries, and runtime for workflows that react to domain events (e.g. `tag:created`, `confidence:recorded`). Workflows match conditions on event payloads and dispatch jobs that can themselves trigger further workflows, with depth limiting to prevent infinite loops.

## Key Exports

### Types

| Type | Description |
|------|-------------|
| `Workflow` | Trigger event + conditions + enabled flag |
| `WorkflowJob` | Job definition within a workflow (type, params, delay) |
| `WorkflowWithJobs` | Workflow bundled with its full job list |
| `JobRun` | Execution record with status and result |
| `Executor` | `(input) => Promise<JobResult>` |
| `ExecutorRegistry` | Registry mapping job types to executors |
| `WorkflowEngine` | Main dispatch engine |
| `JobRunner` | Background job processor with event emitter |

### Factories

| Function | Description |
|----------|-------------|
| `createExecutorRegistry()` | Create a new executor registry |
| `createWorkflowEngine()` | Create engine with configurable depth limit (default 3) |
| `createJobRunner()` | Create background processor with polling |

## Design

- Condition matching on event payloads
- Depth limiting prevents infinite cascading
- Async job execution with error capture
- Event emitter pattern for status updates
