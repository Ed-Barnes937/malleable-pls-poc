-- Migration 022: an upload is saved once, however often it is sent
-- The client gives each capture (or picked file) an id and sends it with
-- every try of its upload (`x-upload-id`). A try whose response was lost
-- (the upload was saved, the client never heard) is retried with the same
-- id, and the server returns the recording it already has instead of saving
-- the audio a second time. Unique per student; null for uploads made before
-- this, or by clients that send none.
--
-- Idempotent (safe to re-run).

ALTER TABLE recordings ADD COLUMN IF NOT EXISTS upload_id TEXT;
ALTER TABLE recordings DROP CONSTRAINT IF EXISTS chk_recordings_upload_id;
ALTER TABLE recordings ADD CONSTRAINT chk_recordings_upload_id
  CHECK (upload_id IS NULL OR char_length(upload_id) BETWEEN 1 AND 64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recordings_upload_id
  ON recordings (user_id, upload_id) WHERE upload_id IS NOT NULL;
