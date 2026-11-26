-- Migration 023: a plan item keeps the zone it was made in
-- A class occurrence's lecture is keyed by the occurrence's local date
-- (`lectures.class_date`). A weekly series is dated in its own zone
-- (`recurrence.timeZone`); a one-off class had no zone of its own, so it was
-- dated in the student's zone at the time of asking. A later change of the
-- student's time zone (or a device in another zone, with no preference set)
-- could then date the same occurrence a day apart and make it a second
-- lecture. `time_zone` is the student's zone when the item was made (set
-- once, kept by edits), so every caller dates it the same.
--
-- Data step: existing items take the student's preference, else
-- Europe/London: the zone 020 dated linked lectures in, so links made by
-- 020 still name the same day.
--
-- Idempotent (safe to re-run).

ALTER TABLE plan_items ADD COLUMN IF NOT EXISTS time_zone TEXT;
ALTER TABLE plan_items DROP CONSTRAINT IF EXISTS chk_plan_items_time_zone;
ALTER TABLE plan_items ADD CONSTRAINT chk_plan_items_time_zone
  CHECK (time_zone IS NULL OR char_length(time_zone) BETWEEN 1 AND 100);

UPDATE plan_items p
SET time_zone = COALESCE(
  (SELECT up.time_zone FROM user_preferences up WHERE up.user_id = p.user_id),
  'Europe/London'
)
WHERE p.time_zone IS NULL;
