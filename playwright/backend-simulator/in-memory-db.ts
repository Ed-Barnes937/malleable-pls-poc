import type {
  Recording,
  TranscriptSegment,
  Tag,
  Annotation,
  ConfidenceSignal,
  Link,
  Workspace,
  WorkspacePanel,
  WorkspaceScope,
  Workflow,
  WorkflowJob,
  JobRun,
} from '@pls/substrate/src/types'

export interface SeedData {
  recordings: Recording[]
  transcriptSegments: TranscriptSegment[]
  tags: Tag[]
  annotations: Annotation[]
  confidenceSignals: ConfidenceSignal[]
  links: Link[]
  workspaces: Workspace[]
  workspacePanels: WorkspacePanel[]
  workspaceScopes: WorkspaceScope[]
  workflows: Workflow[]
  workflowJobs: WorkflowJob[]
  jobRuns: JobRun[]
}

const EMPTY_SEED: SeedData = {
  recordings: [],
  transcriptSegments: [],
  tags: [],
  annotations: [],
  confidenceSignals: [],
  links: [],
  workspaces: [],
  workspacePanels: [],
  workspaceScopes: [],
  workflows: [],
  workflowJobs: [],
  jobRuns: [],
}

export class InMemoryDb {
  recordings: Recording[] = []
  transcriptSegments: TranscriptSegment[] = []
  tags: Tag[] = []
  annotations: Annotation[] = []
  confidenceSignals: ConfidenceSignal[] = []
  links: Link[] = []
  workspaces: Workspace[] = []
  workspacePanels: WorkspacePanel[] = []
  workspaceScopes: WorkspaceScope[] = []
  workflows: Workflow[] = []
  workflowJobs: WorkflowJob[] = []
  jobRuns: JobRun[] = []

  constructor(seed?: SeedData) {
    if (seed) {
      this.reset(seed)
    }
  }

  findById<T extends { id: string }>(collection: T[], id: string): T | undefined {
    return collection.find((item) => item.id === id)
  }

  insert<T extends { id: string }>(collection: T[], item: T): T {
    collection.push(item)
    return item
  }

  remove<T extends { id: string }>(collection: T[], id: string): boolean {
    const index = collection.findIndex((item) => item.id === id)
    if (index === -1) return false
    collection.splice(index, 1)
    return true
  }

  reset(seed: SeedData): void {
    this.recordings = [...seed.recordings]
    this.transcriptSegments = [...seed.transcriptSegments]
    this.tags = [...seed.tags]
    this.annotations = [...seed.annotations]
    this.confidenceSignals = [...seed.confidenceSignals]
    this.links = [...seed.links]
    this.workspaces = [...seed.workspaces]
    this.workspacePanels = [...seed.workspacePanels]
    this.workspaceScopes = [...seed.workspaceScopes]
    this.workflows = [...seed.workflows]
    this.workflowJobs = [...seed.workflowJobs]
    this.jobRuns = [...seed.jobRuns]
  }
}
