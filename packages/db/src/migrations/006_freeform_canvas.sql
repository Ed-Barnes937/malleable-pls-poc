-- Migration 006: Freeform canvas layout
-- Switch workspace_panels from grid-based to pixel-based positioning.
-- Wipe existing layout data (no real users yet).

-- Wipe existing panel data before schema change
DELETE FROM workspace_panels;

-- Drop grid columns and add pixel-based positioning
ALTER TABLE workspace_panels DROP COLUMN grid_x;
ALTER TABLE workspace_panels DROP COLUMN grid_y;
ALTER TABLE workspace_panels DROP COLUMN grid_w;
ALTER TABLE workspace_panels DROP COLUMN grid_h;

ALTER TABLE workspace_panels ADD COLUMN pos_x INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspace_panels ADD COLUMN pos_y INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspace_panels ADD COLUMN width INTEGER NOT NULL DEFAULT 280;
ALTER TABLE workspace_panels ADD COLUMN height INTEGER NOT NULL DEFAULT 220;
ALTER TABLE workspace_panels ADD COLUMN z_index INTEGER NOT NULL DEFAULT 0;

-- Add workspace background support
ALTER TABLE workspaces ADD COLUMN background_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE workspaces ADD COLUMN background_value TEXT NOT NULL DEFAULT '';
