-- Migration 007: Workspace sort order
-- Allow users to drag-reorder workspace tabs.

ALTER TABLE workspaces ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
