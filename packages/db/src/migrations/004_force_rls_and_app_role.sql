-- Force RLS on all tables so that the table owner also respects RLS policies.
-- Without FORCE, the owner role bypasses all RLS policies.

ALTER TABLE recordings FORCE ROW LEVEL SECURITY;
ALTER TABLE transcript_segments FORCE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;
ALTER TABLE annotations FORCE ROW LEVEL SECURITY;
ALTER TABLE links FORCE ROW LEVEL SECURITY;
ALTER TABLE confidence_signals FORCE ROW LEVEL SECURITY;
ALTER TABLE lens_data FORCE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_panels FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE workflows FORCE ROW LEVEL SECURITY;
ALTER TABLE workflow_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE job_runs FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Create a non-owner application role (pls_app)
-- ---------------------------------------------------------------------------
-- NOTE: After deploying this migration, update the connection string in
-- deployment config to use the pls_app role instead of the table owner.
-- This ensures the app connects as a non-owner, so RLS policies are enforced
-- even without FORCE (defence in depth).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pls_app') THEN
    CREATE ROLE pls_app LOGIN PASSWORD 'pls_app';
  END IF;
END
$$;

-- Grant connect and usage (use current_database() so it works regardless of DB name)
DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO pls_app', current_database()); END $$;
GRANT USAGE ON SCHEMA public TO pls_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pls_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO pls_app;

-- Make sure future tables also get the right grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pls_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO pls_app;
