-- Migration 024: deleted plan items can be put back (Undo)
-- Deleting a plan item stays a real delete: the row leaves plan_items, so
-- no reader can show it by mistake. A copy goes to plan_item_trash first,
-- with what the delete clears elsewhere (its course tag, the lectures linked
-- to it as a class), so planItems.restore can put it back exactly: same id,
-- same row, recurring series and the to-do's sessions included. A to-do's
-- sessions are trashed with it (`parent_id`) and come back with it.
--
-- `row` is the plan_items row as JSON (jsonb_populate_record puts it back,
-- whatever columns plan_items has by then). Rows are kept a day: Undo is
-- offered for seconds, so older ones are purged on the next delete or restore.
--
-- Idempotent (safe to re-run).

CREATE TABLE IF NOT EXISTS plan_item_trash (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  -- The item the student deleted, for rows trashed along with it (its sessions).
  parent_id   TEXT,
  row         JSONB NOT NULL,
  course      TEXT,
  lecture_ids TEXT[] NOT NULL DEFAULT '{}',
  deleted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_item_trash_parent ON plan_item_trash(user_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_plan_item_trash_deleted_at ON plan_item_trash(deleted_at);

ALTER TABLE plan_item_trash ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_item_trash FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON plan_item_trash;
CREATE POLICY tenant_isolation ON plan_item_trash
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON plan_item_trash TO pls_app;
