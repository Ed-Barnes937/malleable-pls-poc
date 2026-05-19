-- Multi-tenant Postgres schema for Malleable PLS
-- Every row-level table includes user_id for tenant isolation.
-- RLS policies enforce that users can only access their own data.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helper: set app.current_user_id before each request (used by RLS)
-- ---------------------------------------------------------------------------
-- Usage in tRPC middleware:
--   await sql`SELECT set_config('app.current_user_id', ${ctx.userId}, true)`
--

-- ---------------------------------------------------------------------------
-- Content tables
-- ---------------------------------------------------------------------------

CREATE TABLE recordings (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration    INTEGER NOT NULL DEFAULT 0,
  audio_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'ready'
);

CREATE TABLE transcript_segments (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       TEXT NOT NULL,
  recording_id  TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  start_ms      INTEGER NOT NULL,
  end_ms        INTEGER NOT NULL,
  text          TEXT NOT NULL,
  speaker       TEXT
);

-- ---------------------------------------------------------------------------
-- User annotations & tags
-- ---------------------------------------------------------------------------

CREATE TABLE tags (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  label       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE annotations (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         TEXT NOT NULL,
  anchor_type     TEXT NOT NULL,
  anchor_id       TEXT NOT NULL,
  anchor_start_ms INTEGER,
  anchor_end_ms   INTEGER,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Relationships & analytics
-- ---------------------------------------------------------------------------

CREATE TABLE links (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       TEXT NOT NULL,
  source_type   TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  target_type   TEXT NOT NULL,
  target_id     TEXT NOT NULL,
  relationship  TEXT
);

CREATE TABLE confidence_signals (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         TEXT NOT NULL,
  target_type     TEXT NOT NULL,
  target_id       TEXT NOT NULL,
  score           DOUBLE PRECISION NOT NULL,
  source_lens_id  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  decay_curve     TEXT
);

CREATE TABLE lens_data (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL,
  lens_type   TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  data        JSONB NOT NULL
);

-- ---------------------------------------------------------------------------
-- Workspace management
-- ---------------------------------------------------------------------------

CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_panels (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       TEXT NOT NULL,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lens_type     TEXT NOT NULL,
  slot_name     TEXT NOT NULL,
  config        JSONB NOT NULL DEFAULT '{}',
  grid_x        INTEGER NOT NULL DEFAULT 0,
  grid_y        INTEGER NOT NULL DEFAULT 0,
  grid_w        INTEGER NOT NULL DEFAULT 1,
  grid_h        INTEGER NOT NULL DEFAULT 2,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_scopes (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       TEXT NOT NULL,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope_type    TEXT NOT NULL,
  scope_value   TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Workflow / automation engine
-- ---------------------------------------------------------------------------

CREATE TABLE workflows (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         TEXT NOT NULL,
  source_lens     TEXT NOT NULL,
  trigger_event   TEXT NOT NULL,
  condition_field TEXT,
  condition_value TEXT,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  workspace_id    TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflow_jobs (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       TEXT NOT NULL,
  workflow_id   TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  job_type      TEXT NOT NULL,
  params        JSONB NOT NULL DEFAULT '{}',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  delay_ms      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE job_runs (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id           TEXT NOT NULL,
  workflow_id       TEXT NOT NULL,
  workflow_job_id   TEXT NOT NULL,
  job_type          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  input             JSONB,
  output            JSONB,
  error             TEXT,
  depth             INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_recordings_user ON recordings(user_id);
CREATE INDEX idx_segments_recording ON transcript_segments(recording_id);
CREATE INDEX idx_segments_user ON transcript_segments(user_id);
CREATE INDEX idx_tags_target ON tags(target_type, target_id);
CREATE INDEX idx_tags_label ON tags(label);
CREATE INDEX idx_tags_user ON tags(user_id);
CREATE INDEX idx_annotations_anchor ON annotations(anchor_type, anchor_id);
CREATE INDEX idx_annotations_user ON annotations(user_id);
CREATE INDEX idx_confidence_target ON confidence_signals(target_type, target_id);
CREATE INDEX idx_confidence_user ON confidence_signals(user_id);
CREATE INDEX idx_links_source ON links(source_type, source_id);
CREATE INDEX idx_links_target ON links(target_type, target_id);
CREATE INDEX idx_links_user ON links(user_id);
CREATE INDEX idx_lens_data_user ON lens_data(user_id);
CREATE INDEX idx_panels_workspace ON workspace_panels(workspace_id);
CREATE INDEX idx_panels_user ON workspace_panels(user_id);
CREATE INDEX idx_scopes_workspace ON workspace_scopes(workspace_id);
CREATE INDEX idx_scopes_user ON workspace_scopes(user_id);
CREATE INDEX idx_workspaces_user ON workspaces(user_id);
CREATE INDEX idx_workflows_lens ON workflows(source_lens);
CREATE INDEX idx_workflows_trigger ON workflows(trigger_event);
CREATE INDEX idx_workflows_workspace ON workflows(workspace_id);
CREATE INDEX idx_workflows_user ON workflows(user_id);
CREATE INDEX idx_workflow_jobs_workflow ON workflow_jobs(workflow_id);
CREATE INDEX idx_workflow_jobs_user ON workflow_jobs(user_id);
CREATE INDEX idx_job_runs_status ON job_runs(status);
CREATE INDEX idx_job_runs_user ON job_runs(user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE links ENABLE ROW LEVEL SECURITY;
ALTER TABLE confidence_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE lens_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_panels ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON recordings
  USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY tenant_isolation ON transcript_segments
  USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY tenant_isolation ON tags
  USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY tenant_isolation ON annotations
  USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY tenant_isolation ON links
  USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY tenant_isolation ON confidence_signals
  USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY tenant_isolation ON lens_data
  USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY tenant_isolation ON workspaces
  USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY tenant_isolation ON workspace_panels
  USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY tenant_isolation ON workspace_scopes
  USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY tenant_isolation ON workflows
  USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY tenant_isolation ON workflow_jobs
  USING (user_id = current_setting('app.current_user_id', true));
CREATE POLICY tenant_isolation ON job_runs
  USING (user_id = current_setting('app.current_user_id', true));

-- ---------------------------------------------------------------------------
-- Migration tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS _migrations (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
