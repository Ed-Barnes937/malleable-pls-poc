-- Migration 025: a plan item's course is a column
-- A plan item carried its course as a 'plan_item' tag (011), read as its
-- first tag by (created_at, id). It becomes `plan_items.course`, the same
-- course key `lectures.course` holds (validated by the API, not a CHECK, so
-- the courses table can take over with a foreign key). See
-- plans/product-changes/11-courses-table.md (PR 1).
--
-- 1. Add `plan_items.course` (NULL = not filed under a course).
-- 2. Backfill it from the item's first 'plan_item' tag by (created_at, id):
--    the one every reader showed as its course, so nothing visible changes.
--    Any label is kept, a course key or not: nothing was validated, and the
--    courses table (11 PR 2) gives stray values a course of their own.
-- 3. Remove the 'plan_item' tags: the column holds the course now. An item
--    with several keeps only the first; say how many were dropped.
-- 4. Trashed items (024) keep their course in `row` too, so restoring one
--    puts the column back with the rest of the row.
--
-- Idempotent (safe to re-run): the tags are gone after the first run.

-- 1.
ALTER TABLE plan_items ADD COLUMN IF NOT EXISTS course TEXT;
CREATE INDEX IF NOT EXISTS idx_plan_items_user_course ON plan_items(user_id, course);

-- 2.
UPDATE plan_items p
SET course = (
  SELECT t.label FROM tags t
  WHERE t.user_id = p.user_id AND t.target_type = 'plan_item' AND t.target_id = p.id
  ORDER BY t.created_at, t.id LIMIT 1
)
WHERE p.course IS NULL
  AND EXISTS (SELECT 1 FROM tags t WHERE t.user_id = p.user_id AND t.target_type = 'plan_item' AND t.target_id = p.id);

-- 3.
DO $$
DECLARE dropped integer;
BEGIN
  SELECT count(*) INTO dropped
  FROM tags t
  JOIN plan_items p ON p.id = t.target_id AND p.user_id = t.user_id
  WHERE t.target_type = 'plan_item' AND t.label IS DISTINCT FROM p.course;
  IF dropped > 0 THEN
    RAISE NOTICE 'plan item course migration: dropped % extra course tag(s) on plan items; each keeps its first as its course', dropped;
  END IF;
END $$;

DELETE FROM tags WHERE target_type = 'plan_item';

-- 4.
UPDATE plan_item_trash
SET row = row || jsonb_build_object('course', course)
WHERE NOT (row ? 'course');
