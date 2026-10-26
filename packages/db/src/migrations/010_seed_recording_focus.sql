-- Migration 010: Recording focus moves to the workspace scope
-- The focus-scope refactor reverses 009: tool lenses (transcript,
-- audio-capture, connections) now read `scope.recordingId` from a
-- `workspace_scopes` row of type 'recording' instead of `config.recordingId`.
--
-- 1. Strip the now-unread `recordingId` key from every panel config.
-- 2. Re-seed the demo focus so the seeded workspaces open on rec-bio-4.
--    Guarded on the workspace still existing so it is safe to re-run.

UPDATE workspace_panels SET config = config - 'recordingId' WHERE config ? 'recordingId';

INSERT INTO workspace_scopes (id, user_id, workspace_id, scope_type, scope_value)
SELECT v.id, 'dev-user-1', v.workspace_id, 'recording', 'rec-bio-4'
FROM (VALUES
  ('ws-scope-1', 'ws-in-lecture'),
  ('ws-scope-5', 'ws-evening-review')
) AS v(id, workspace_id)
JOIN workspaces w ON w.id = v.workspace_id AND w.user_id = 'dev-user-1'
ON CONFLICT (id) DO NOTHING;
