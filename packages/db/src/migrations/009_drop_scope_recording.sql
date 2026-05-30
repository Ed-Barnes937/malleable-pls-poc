-- Migration 009: Drop obsolete recording-scope rows
-- Following the scope rethink, `recordingId` is no longer part of the
-- workspace-level scope — it lives on each panel's `config`. Any existing
-- `workspace_scopes` rows of type 'recording' are dead data.

DELETE FROM workspace_scopes WHERE scope_type = 'recording';
