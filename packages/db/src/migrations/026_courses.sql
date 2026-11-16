-- Migration 026: courses are the student's own rows
-- A course was a hardcoded key ('biology', 'chemistry', 'physics', checked
-- by the API) held as plain TEXT by lectures, resources, plan items and board
-- scopes. It becomes a row of `courses`, per student, with a display name and
-- a palette colour, so a student can add, rename and retire courses. See
-- plans/product-changes/11-courses-table.md (PR 2).
--
-- `courses.id` is opaque: references hold it, the name is only ever read
-- from `courses`, and it is never shown or parsed. The three courses every
-- student had keep their old keys as ids, so no reference is rewritten; new
-- courses get a uuid.
--
-- 1. Create `courses`, private to the student (RLS per user_id).
-- 2. Every student with data gets Biology, Chemistry and Physics, the
--    courses the app offered them until now, in today's colours.
-- 3. Any other course value in use (lectures, resources, plan items, board
--    course scopes, trashed plan items) becomes a course of its own, named
--    after the value, so nothing is dropped (plan items were never checked).
-- 4. `plan_item_trash.course` goes: the row's own `course` (025) is the one
--    restore uses, unfiling the item if that course is gone by then.
-- 5. Lectures, resources and plan items reference their course by a foreign
--    key on (user_id, course), so a reference never dangles or crosses
--    students (foreign keys skip RLS, the key includes the student), and a
--    course in use can't be deleted. Board course scopes ('tag' rows) can't
--    take one (`scope_value` also holds lecture ids): the API keeps them.
--
-- New students start with no courses (11 Q5); seeds and the e2e reseed add
-- the three themselves.
--
-- Idempotent (safe to re-run).

-- 1.
CREATE TABLE IF NOT EXISTS courses (
  user_id     TEXT NOT NULL,
  -- Opaque: never displayed, never parsed. 'biology', 'chemistry' and
  -- 'physics' for the migrated courses, a uuid for new ones.
  id          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL,
  -- A palette key (COURSE_COLORS in @pls/substrate), checked by the API.
  color       TEXT NOT NULL,
  -- Archived: hidden from pickers, still shown on what it files. NULL = active.
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, id),
  CONSTRAINT chk_courses_name CHECK (char_length(btrim(name)) BETWEEN 1 AND 60)
);

-- One name per student, whatever the case, archived courses included, so
-- restoring one never collides.
CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_user_name ON courses(user_id, lower(btrim(name)));

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON courses;
CREATE POLICY tenant_isolation ON courses
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON courses TO pls_app;

-- 2.
INSERT INTO courses (user_id, id, name, color)
SELECT students.user_id, starter.id, starter.name, starter.color
FROM (
  SELECT user_id FROM workspaces
  UNION SELECT user_id FROM lectures
  UNION SELECT user_id FROM resources
  UNION SELECT user_id FROM plan_items
  UNION SELECT user_id FROM tags
) students
CROSS JOIN (VALUES
  ('biology', 'Biology', 'green'),
  ('chemistry', 'Chemistry', 'blue'),
  ('physics', 'Physics', 'purple')
) AS starter(id, name, color)
ON CONFLICT DO NOTHING;

-- 3.
DO $$
DECLARE
  palette CONSTANT text[] := ARRAY['green', 'blue', 'purple', 'amber', 'rose', 'teal', 'orange', 'slate'];
  stray record;
  base text;
  candidate text;
  n integer;
  added integer := 0;
BEGIN
  FOR stray IN
    SELECT used.user_id, used.id FROM (
      SELECT user_id, course AS id FROM lectures WHERE course IS NOT NULL
      UNION SELECT user_id, course FROM resources WHERE course IS NOT NULL
      UNION SELECT user_id, course FROM plan_items WHERE course IS NOT NULL
      UNION SELECT user_id, scope_value FROM workspace_scopes WHERE scope_type = 'tag' AND scope_value IS NOT NULL
      UNION SELECT user_id, row->>'course' FROM plan_item_trash WHERE row->>'course' IS NOT NULL
    ) used
    WHERE NOT EXISTS (SELECT 1 FROM courses c WHERE c.user_id = used.user_id AND c.id = used.id)
    ORDER BY used.user_id, lower(used.id) COLLATE "C", used.id COLLATE "C"
  LOOP
    -- Named after the value; a name the student already has gets " (2)", ...
    base := left(initcap(btrim(stray.id)), 55);
    IF base = '' THEN base := 'Course'; END IF;
    candidate := base;
    n := 1;
    WHILE EXISTS (
      SELECT 1 FROM courses c WHERE c.user_id = stray.user_id AND lower(btrim(c.name)) = lower(btrim(candidate))
    ) LOOP
      n := n + 1;
      candidate := base || ' (' || n || ')';
    END LOOP;
    -- The colour the student's courses use least, palette order breaking ties.
    INSERT INTO courses (user_id, id, name, color)
    SELECT stray.user_id, stray.id, candidate, p.color
    FROM unnest(palette) WITH ORDINALITY AS p(color, ord)
    ORDER BY (SELECT count(*) FROM courses c WHERE c.user_id = stray.user_id AND c.color = p.color AND c.archived_at IS NULL), p.ord
    LIMIT 1;
    added := added + 1;
  END LOOP;
  IF added > 0 THEN
    RAISE NOTICE 'courses migration: % course value(s) in use were not Biology, Chemistry or Physics; each became a course of its own', added;
  END IF;
END $$;

-- 4.
ALTER TABLE plan_item_trash DROP COLUMN IF EXISTS course;

-- 5.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lectures_course') THEN
    ALTER TABLE lectures ADD CONSTRAINT fk_lectures_course
      FOREIGN KEY (user_id, course) REFERENCES courses(user_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_resources_course') THEN
    ALTER TABLE resources ADD CONSTRAINT fk_resources_course
      FOREIGN KEY (user_id, course) REFERENCES courses(user_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plan_items_course') THEN
    ALTER TABLE plan_items ADD CONSTRAINT fk_plan_items_course
      FOREIGN KEY (user_id, course) REFERENCES courses(user_id, id) ON DELETE RESTRICT;
  END IF;
END $$;
