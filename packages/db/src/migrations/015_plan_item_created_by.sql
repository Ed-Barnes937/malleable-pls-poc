-- Migration 015: which automation made a plan item
-- Provenance alongside source_type / source_id / source_offset_ms (where the
-- item came from): the workflow that created it, so the Calendar can name it
-- ("Made by ...") with a link to edit it. NULL for items a person made and
-- for rows created before this column existed. Deleting the automation keeps
-- the item and forgets who made it.

ALTER TABLE plan_items
  ADD COLUMN created_by_workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL;
