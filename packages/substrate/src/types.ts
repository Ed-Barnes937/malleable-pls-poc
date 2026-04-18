export interface Recording {
  id: string
  title: string
  created_at: string
  duration: number
  audio_url: string | null
  status: string
}

export interface TranscriptSegment {
  id: string
  recording_id: string
  start_ms: number
  end_ms: number
  text: string
  speaker: string | null
}

export interface Annotation {
  id: string
  anchor_type: string
  anchor_id: string
  anchor_start_ms: number | null
  anchor_end_ms: number | null
  body: string
  created_at: string
  author_id: string
}

export interface Tag {
  id: string
  target_type: string
  target_id: string
  label: string
  created_at: string
}

export interface Link {
  id: string
  source_type: string
  source_id: string
  target_type: string
  target_id: string
  relationship: string | null
}

export interface ConfidenceSignal {
  id: string
  target_type: string
  target_id: string
  score: number
  source_lens_id: string | null
  created_at: string
  decay_curve: string | null
}

export interface LensData {
  id: string
  lens_type: string
  target_type: string | null
  target_id: string | null
  data: string
}

export interface Workspace {
  id: string
  name: string
  owner_id: string
  created_at: string
}

export interface WorkspacePanel {
  id: string
  workspace_id: string
  lens_type: string
  slot_name: string
  config: string
  col_span: number
  row_span: number
  created_at: string
}

export interface WorkspaceScope {
  id: string
  workspace_id: string
  scope_type: string
  scope_value: string
}

export interface Scope {
  courseTag?: string
  recordingId?: string
  timeframe?: 'week' | 'all'
}

export interface CourseOverview {
  course: string
  totalSegments: number
  confidentSegments: number
  gapCount: number
  percentage: number
}

export interface CourseGap {
  course: string
  percentage: number
  weakAreaCount: number
}

export interface WeakTopic {
  rank: number
  conceptLabel: string
  course: string
  week: string
  avgConfidence: number
}

export interface ConnectionResult {
  sourceType: string
  sourceId: string
  sourceTitle: string
  sourceDate: string
  relationship: string | null
}

export interface NewTag {
  target_type: string
  target_id: string
  label: string
}

export interface NewAnnotation {
  anchor_type: string
  anchor_id: string
  anchor_start_ms?: number
  anchor_end_ms?: number
  body: string
}

export interface NewConfidenceSignal {
  target_type: string
  target_id: string
  score: number
  source_lens_id: string
}

export interface Question {
  id: string
  conceptLabel: string
  segmentId: string
  question: string
  answer: string
  difficulty: 'easy' | 'medium' | 'hard'
}
