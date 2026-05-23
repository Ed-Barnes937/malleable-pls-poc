-- Migration 007: Workspace sort order
-- Allow users to drag-reorder workspace tabs.

ALTER TABLE workspaces ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE workspaces SET sort_order = sub.rn FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id) - 1 AS rn
  FROM workspaces
) sub WHERE workspaces.id = sub.id;
