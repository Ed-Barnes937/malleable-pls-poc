-- Migration 017: lectures
-- A lecture becomes its own row: a session of a course at a time, which can
-- exist before (or without) any audio. Recordings belong to a lecture, and a
-- recording's course is its lecture's course (`lectures.course`) instead of
-- a 'recording' tag. See plans/product-changes/02-course-lecture-model.md.
--
-- 1. Create `lectures` (RLS as every other table) and `recordings.lecture_id`.
-- 2. Backfill one lecture per recording that has none: id 'lec-' || the
--    recording id, its title (or 'Untitled lecture') and created_at, and its first course tag as the
--    course (NULL = not filed under a course).
-- 3. Remove the course tags on recordings: the lecture holds the course now.
-- 4. Board focus rows ('recording' = a recording id) become 'lecture' rows
--    naming that recording's lecture. A focus on a recording that no longer
--    exists is dropped.
-- 5. Every recording now has a lecture: lecture_id NOT NULL.
--
-- Idempotent: e2e/reseed.ts re-runs it after the SQL seeds, which insert
-- recordings, course tags and focus rows the old way.

CREATE TABLE IF NOT EXISTS lectures (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  -- Course key from COURSE_LABELS (validated by the API, not a CHECK, so a
  -- later courses table can take over). NULL = not filed under a course.
  course        TEXT,
  -- When it happened, or will happen.
  starts_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The class occurrence it is, if any: a recurring 'class' commitment and
  -- the local date of the occurrence. Written by class matching (later).
  class_item_id TEXT REFERENCES plan_items(id) ON DELETE SET NULL,
  class_date    DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_lectures_title CHECK (char_length(title) BETWEEN 1 AND 500),
  CONSTRAINT chk_lectures_class CHECK ((class_item_id IS NULL) = (class_date IS NULL))
);

-- One lecture per class occurrence per student.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lectures_class_occurrence
  ON lectures(user_id, class_item_id, class_date) WHERE class_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lectures_user_course ON lectures(user_id, course, starts_at DESC);

ALTER TABLE lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE lectures FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON lectures;
CREATE POLICY tenant_isolation ON lectures
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON lectures TO pls_app;

-- Deleting a lecture deletes its recordings (and, through them, their
-- transcripts): any lecture can be deleted in v1.
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS lecture_id TEXT REFERENCES lectures(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_recordings_lecture ON recordings(lecture_id);

-- 2. One lecture per recording without one.
INSERT INTO lectures (id, user_id, title, course, starts_at, created_at, updated_at)
SELECT
  'lec-' || r.id,
  r.user_id,
  COALESCE(NULLIF(left(r.title, 500), ''), 'Untitled lecture'),
  (
    SELECT t.label FROM tags t
    WHERE t.user_id = r.user_id AND t.target_type = 'recording' AND t.target_id = r.id
      AND t.label IN ('biology', 'chemistry', 'physics')
    ORDER BY t.created_at, t.id LIMIT 1
  ),
  r.created_at,
  r.created_at,
  r.created_at
FROM recordings r
WHERE r.lecture_id IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE recordings SET lecture_id = 'lec-' || id WHERE lecture_id IS NULL;

-- 3. The course lives on the lecture now.
DELETE FROM tags
WHERE target_type = 'recording' AND label IN ('biology', 'chemistry', 'physics');

-- 4. Board focus: recording -> its lecture.
UPDATE workspace_scopes ws
SET scope_type = 'lecture', scope_value = r.lecture_id
FROM recordings r
WHERE ws.scope_type = 'recording' AND r.id = ws.scope_value AND r.user_id = ws.user_id;

DELETE FROM workspace_scopes WHERE scope_type = 'recording';

-- 5.
ALTER TABLE recordings ALTER COLUMN lecture_id SET NOT NULL;
