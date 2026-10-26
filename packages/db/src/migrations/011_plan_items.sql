-- Migration 011: plan_items core type
-- One shared type for everything on a student's plan: fixed commitments
-- (classes, shifts), deadlines and to-dos. Calendar, To-do and Coming up are
-- views over this table. Course attaches via the existing `tags` table
-- (target_type = 'plan_item'), the same way recordings carry their course.

CREATE TABLE plan_items (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id          TEXT NOT NULL,
  kind             TEXT NOT NULL,
  title            TEXT NOT NULL,
  -- Commitments and scheduled tasks occupy [starts_at, ends_at).
  starts_at        TIMESTAMPTZ,
  ends_at          TIMESTAMPTZ,
  -- Deadlines (required) and tasks (optional).
  due_at           TIMESTAMPTZ,
  -- Task estimate in minutes.
  duration_min     INTEGER,
  status           TEXT NOT NULL DEFAULT 'open',
  -- NULL, or { "freq": "weekly", "until"?: ISO timestamp, "timeZone"?: IANA zone }.
  recurrence       JSONB,
  -- Free-text label, e.g. class / shift / study.
  subtype          TEXT,
  -- Provenance, e.g. source_type = 'recording', source_id = rec id,
  -- source_offset_ms = the moment within it.
  source_type      TEXT,
  source_id        TEXT,
  source_offset_ms INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_plan_items_kind CHECK (kind IN ('commitment', 'deadline', 'task')),
  CONSTRAINT chk_plan_items_status CHECK (status IN ('open', 'done', 'dismissed')),
  CONSTRAINT chk_plan_items_span CHECK (
    (starts_at IS NULL AND ends_at IS NULL)
    OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at)
  ),
  CONSTRAINT chk_plan_items_commitment_span CHECK (kind <> 'commitment' OR starts_at IS NOT NULL),
  CONSTRAINT chk_plan_items_deadline_due CHECK (kind <> 'deadline' OR due_at IS NOT NULL),
  CONSTRAINT chk_plan_items_duration CHECK (duration_min IS NULL OR duration_min > 0),
  CONSTRAINT chk_plan_items_recurrence CHECK (
    recurrence IS NULL
    OR (recurrence->>'freq' = 'weekly' AND starts_at IS NOT NULL)
  )
);

CREATE INDEX idx_plan_items_user ON plan_items(user_id);
CREATE INDEX idx_plan_items_user_starts ON plan_items(user_id, starts_at);
CREATE INDEX idx_plan_items_user_due ON plan_items(user_id, due_at);
CREATE INDEX idx_plan_items_source ON plan_items(source_type, source_id);

ALTER TABLE plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_items FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON plan_items
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON plan_items TO pls_app;
