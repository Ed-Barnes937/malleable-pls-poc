import type {
  Lecture,
  Recording,
  TranscriptSegment,
  Tag,
  Annotation,
  ConfidenceSignal,
  Link,
  Workspace,
  WorkspacePanel,
  WorkspaceScope,
  PlanItem,
  StoredPreferences,
} from '@pls/substrate'

/** A plan item as stored: course is derived from `tags`, as on the server. */
export type StoredPlanItem = Omit<PlanItem, 'course'>

/** A recording as stored: its course is its lecture's, as on the server. */
export type StoredRecording = Omit<Recording, 'course' | 'processing'>

/** A lecture as stored (`lectures`); its recordings point at it. */
export type StoredLecture = Omit<Lecture, 'recordings'>

// Simulator-internal types: enabled/params stored as raw DB primitives
export interface Workflow {
  id: string
  source_lens: string
  trigger_event: string
  condition_field: string | null
  condition_value: string | null
  enabled: number
  workspace_id: string | null
  created_at: string
}

export interface WorkflowJob {
  id: string
  workflow_id: string
  job_type: string
  params: string
  sort_order: number
  delay_ms: number
}

export interface JobRun {
  id: string
  workflow_id: string
  workflow_job_id: string
  job_type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  input: string | null
  output: string | null
  error: string | null
  depth: number
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface SeedData {
  lectures: StoredLecture[]
  recordings: StoredRecording[]
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
  planItems: StoredPlanItem[]
  /** The user's study rhythm row; null = never set (all defaults), as with no `user_preferences` row. */
  preferences: StoredPreferences | null
}

const EMPTY_SEED: SeedData = {
  lectures: [],
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
  planItems: [],
  preferences: null,
}

export class InMemoryDb {
  lectures: StoredLecture[] = []
  recordings: StoredRecording[] = []
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
  planItems: StoredPlanItem[] = []
  preferences: StoredPreferences | null = null

  constructor(seed?: SeedData) {
    if (seed) {
      this.reset(seed)
    }
  }

  /**
   * Adds a recording under a lecture, for tests: into `lectureId` when given,
   * else a lecture of its own ('lec-' + its id, like the seed) with its
   * title, time and `course`. Returns the lecture id.
   */
  addRecording(
    recording: Omit<StoredRecording, 'lecture_id'>,
    options: { lectureId?: string; course?: string | null } = {},
  ): string {
    const lectureId = options.lectureId ?? `lec-${recording.id}`
    if (!this.lectures.some((l) => l.id === lectureId)) {
      this.lectures.push({
        id: lectureId, title: recording.title, course: options.course ?? null, starts_at: recording.created_at,
        class_item_id: null, class_date: null, created_at: recording.created_at, updated_at: recording.created_at,
      })
    }
    this.recordings.push({ ...recording, lecture_id: lectureId })
    return lectureId
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
    this.lectures = seed.lectures.map((l) => ({ ...l }))
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
    this.planItems = seed.planItems.map((p) => ({ ...p }))
    this.preferences = seed.preferences ? { ...seed.preferences } : null
  }
}
