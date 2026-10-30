-- Migration 017: default automations for every account
-- Only the seeded demo account had automations, so a new account's upload was
-- never transcribed. The server now gives each account the defaults the first
-- time it sees it (apps/server/src/workflows/defaults.ts); this table records
-- that it has, so an automation the student later deletes stays deleted.
--   - "When a recording finishes, transcribe it"
--   - "When a lecture transcript is ready, write a 3-line summary"
--   - "When I mark something confusing, add a 20-min review within 3 days"
-- Keep the three definitions below in step with defaults.ts.
-- Backfill: every account that already has data is marked, and those with no
-- automation at all get the defaults. Accounts that have some keep exactly
-- what they have.

CREATE TABLE user_provisioning (
  user_id                TEXT PRIMARY KEY,
  default_automations_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_provisioning ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_provisioning FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON user_provisioning
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON user_provisioning TO pls_app;

-- Accounts with data but no automation, before they are marked.
CREATE TEMP TABLE _needs_defaults ON COMMIT DROP AS
SELECT u.user_id
FROM (
  SELECT user_id FROM workspaces
  UNION SELECT user_id FROM recordings
  UNION SELECT user_id FROM workflows
) u
WHERE NOT EXISTS (SELECT 1 FROM workflows w WHERE w.user_id = u.user_id);

INSERT INTO user_provisioning (user_id)
SELECT user_id FROM workspaces
UNION SELECT user_id FROM recordings
UNION SELECT user_id FROM workflows
ON CONFLICT (user_id) DO NOTHING;

CREATE TEMP TABLE _new_workflows ON COMMIT DROP AS
SELECT n.user_id, d.key, gen_random_uuid()::text AS workflow_id
FROM _needs_defaults n
CROSS JOIN (VALUES ('transcribe'), ('summary'), ('confused-review')) AS d(key);

INSERT INTO workflows (id, user_id, source_lens, trigger_event, condition_field, condition_value, enabled, workspace_id)
SELECT nw.workflow_id, nw.user_id, v.source_lens, v.trigger_event, v.condition_field, v.condition_value, true, NULL
FROM _new_workflows nw
JOIN (VALUES
  ('transcribe',      'audio-capture', 'recording:completed',   NULL,    NULL),
  ('summary',         'audio-capture', 'recording:transcribed', NULL,    NULL),
  ('confused-review', 'transcript',    'tag:created',           'label', 'confused')
) AS v(key, source_lens, trigger_event, condition_field, condition_value) ON v.key = nw.key;

INSERT INTO workflow_jobs (user_id, workflow_id, job_type, params, sort_order, delay_ms)
SELECT nw.user_id, nw.workflow_id, v.job_type, v.params::jsonb, 0, 0
FROM _new_workflows nw
JOIN (VALUES
  ('transcribe',      'ai:transcribe',        '{}'),
  ('summary',         'ai:summarize-lecture', '{}'),
  ('confused-review', 'plan:review-task',     '{"durationMin": 20, "windowDays": 3, "timeZone": "Europe/London"}')
) AS v(key, job_type, params) ON v.key = nw.key;
