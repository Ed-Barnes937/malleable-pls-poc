# @pls/substrate

Application data layer — React Query hooks, queries, and state management for the entire PLS.

## Overview

Wraps the browser SQLite database with typed React hooks for every domain entity: recordings, transcripts, tags, annotations, confidence signals, connections, workspaces, and workflows. Also ships seed data for development.

## Key Exports

### Data Hooks

| Hook | Domain |
|------|--------|
| `useRecordings` | Audio recordings |
| `useTranscript` | Transcript segments |
| `useTags` | Segment tags (confused, key-point, question) |
| `useAnnotations` | Free-text notes on segments |
| `useConfidence` | Per-segment confidence scores (0–100) |
| `useConnections` | Concept relationships across recordings |
| `useWeeklyOverview` | Aggregated weekly progress |
| `useGapAnalysis` | Course-level gap identification |
| `useWeakestTopics` | Ranked low-confidence topics |

### Workspace Hooks

`useWorkspacePanels`, `useWorkspaceScopes`, `useAddWorkspacePanel`, `useRemoveWorkspacePanel`, `useUpdatePanelLayouts`

### Workflow Hooks

`useWorkflowsForLens`, `useJobRunner`, `useToggleWorkflow`

### Database

`initDb`, `query`, `exec`, `persistDb`, `resetDb`

## Internal Dependencies

- `@pls/substrate-core` — low-level database abstraction
- `@pls/workflows` — workflow engine types
