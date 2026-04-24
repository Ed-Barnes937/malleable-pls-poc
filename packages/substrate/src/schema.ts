export const SCHEMA = `
CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  duration INTEGER NOT NULL,
  audio_url TEXT,
  status TEXT NOT NULL DEFAULT 'ready'
);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES recordings(id),
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  text TEXT NOT NULL,
  speaker TEXT
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  anchor_type TEXT NOT NULL,
  anchor_id TEXT NOT NULL,
  anchor_start_ms INTEGER,
  anchor_end_ms INTEGER,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  author_id TEXT NOT NULL DEFAULT 'student-1'
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relationship TEXT
);

CREATE TABLE IF NOT EXISTS confidence_signals (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  score REAL NOT NULL,
  source_lens_id TEXT,
  created_at TEXT NOT NULL,
  decay_curve TEXT
);

CREATE TABLE IF NOT EXISTS lens_data (
  id TEXT PRIMARY KEY,
  lens_type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL DEFAULT 'student-1',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_panels (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  lens_type TEXT NOT NULL,
  slot_name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  grid_x INTEGER NOT NULL DEFAULT 0,
  grid_y INTEGER NOT NULL DEFAULT 0,
  grid_w INTEGER NOT NULL DEFAULT 1,
  grid_h INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_scopes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  scope_type TEXT NOT NULL,
  scope_value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_segments_recording ON transcript_segments(recording_id);
CREATE INDEX IF NOT EXISTS idx_tags_target ON tags(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_tags_label ON tags(label);
CREATE INDEX IF NOT EXISTS idx_confidence_target ON confidence_signals(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_panels_workspace ON workspace_panels(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scopes_workspace ON workspace_scopes(workspace_id);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  source_lens TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  condition_field TEXT,
  condition_value TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  workspace_id TEXT REFERENCES workspaces(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_jobs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id),
  job_type TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  delay_ms INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS job_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  workflow_job_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  input TEXT,
  output TEXT,
  error TEXT,
  depth INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_workflows_lens ON workflows(source_lens);
CREATE INDEX IF NOT EXISTS idx_workflows_trigger ON workflows(trigger_event);
CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON workflows(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflow_jobs_workflow ON workflow_jobs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status);
`
