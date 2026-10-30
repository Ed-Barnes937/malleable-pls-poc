-- Migration 019: a lecture keeps its class date when its class goes
-- `lectures.class_item_id` is ON DELETE SET NULL, but the CHECK from 018
-- required class_item_id and class_date to be set together, so deleting a
-- class that a lecture is linked to failed. The date the lecture was held
-- on stays meaningful after the class is gone, so only a link needs its
-- date (a link names its day); a date without a class is allowed.
--
-- Idempotent (safe to re-run).

ALTER TABLE lectures DROP CONSTRAINT IF EXISTS chk_lectures_class;
ALTER TABLE lectures ADD CONSTRAINT chk_lectures_class
  CHECK (class_item_id IS NULL OR class_date IS NOT NULL);
