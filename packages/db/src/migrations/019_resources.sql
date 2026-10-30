-- Migration 019: resources
-- Links, markdown notes and (later) uploaded files a student keeps for a
-- course or a lecture: the Resources widget. See
-- plans/product-changes/04-content-widget.md.
--
-- A resource attaches to a lecture (lecture_id) or a course (course), never
-- both; both NULL = unfiled. A lecture resource's course is its lecture's,
-- read through the join, never stored, so a lecture moving course takes its
-- resources with it. Deleting a lecture deletes its resources.
--
-- Private to the student like every substrate table (RLS per user_id).
-- Idempotent (safe to re-run).

CREATE TABLE IF NOT EXISTS resources (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  -- link: the URL as given (http/https only, checked by the API) and the
  -- provider derived from it server-side (parseResourceUrl).
  url         TEXT,
  provider    TEXT,
  -- note: the markdown source. The stored format, whatever the editor.
  body_md     TEXT,
  -- file (a later PR): a FileStore key, never a client path.
  file_key    TEXT,
  file_name   TEXT,
  mime_type   TEXT,
  size_bytes  INTEGER,
  lecture_id  TEXT REFERENCES lectures(id) ON DELETE CASCADE,
  -- Course key from COURSE_LABELS, validated by the API like lectures.course.
  course      TEXT,
  -- Manual order later; NULL = newest first.
  sort_order  DOUBLE PRECISION,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_resources_kind CHECK (kind IN ('link', 'note', 'file')),
  CONSTRAINT chk_resources_title CHECK (char_length(title) BETWEEN 1 AND 500),
  CONSTRAINT chk_resources_link CHECK (kind <> 'link' OR url IS NOT NULL),
  CONSTRAINT chk_resources_note CHECK (kind <> 'note' OR body_md IS NOT NULL),
  CONSTRAINT chk_resources_file CHECK (kind <> 'file' OR (file_key IS NOT NULL AND mime_type IS NOT NULL)),
  CONSTRAINT chk_resources_attach CHECK (lecture_id IS NULL OR course IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_resources_lecture ON resources(lecture_id);
CREATE INDEX IF NOT EXISTS idx_resources_user_course ON resources(user_id, course);

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON resources;
CREATE POLICY tenant_isolation ON resources
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON resources TO pls_app;
