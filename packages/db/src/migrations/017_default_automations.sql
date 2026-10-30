-- Migration 017: default automations for every account
-- Only the seeded demo account had automations, so a new account's upload was
-- never transcribed. The server now gives each account the defaults the first
-- time it sees it (apps/server/src/workflows/defaults.ts); this table records
-- that it has, so an automation the student later deletes stays deleted.
--   - "When a recording finishes, transcribe it"
--   - "When a lecture transcript is ready, write a 3-line summary"
--   - "When I mark something confusing, add a 20-min review within 3 days"
-- Accounts that existed before this have no marker: the server provisions them on
-- their first visit (adding the defaults only if they have no automation at all).

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
