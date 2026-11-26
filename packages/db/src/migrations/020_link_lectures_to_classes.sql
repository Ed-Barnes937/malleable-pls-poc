-- Migration 020: link existing lectures to their class occurrence
-- Data only (no DDL), so e2e/reseed.ts runs it too.
--
-- A lecture with a course and no class link is linked to the occurrence of
-- a class block of the same course (a commitment with that course) on the
-- lecture's local date, when that is unambiguous:
--   - exactly one such occurrence is on that date for the lecture, and
--   - no other unlinked lecture would take the same occurrence, and
--   - no lecture is linked to that occurrence already.
-- Anything else is left unlinked. The local date is read in the series'
-- time zone, else the student's preference, else Europe/London (the
-- server's default zone), as `occurrenceDate` in @pls/substrate does; a
-- weekly series follows its own zone's wall clock (UTC when it has none),
-- as `expandPlanItems` does.
--
-- Deterministic and idempotent: a re-run finds the linked lectures linked
-- and their occurrences taken.

WITH classes AS (
  SELECT p.id, p.user_id, p.starts_at, p.recurrence, c.course
  FROM plan_items p
  CROSS JOIN LATERAL (
    SELECT (
      SELECT t.label FROM tags t
      WHERE t.target_type = 'plan_item' AND t.target_id = p.id
      ORDER BY t.created_at, t.id LIMIT 1
    ) AS course
  ) c
  WHERE p.kind = 'commitment' AND p.starts_at IS NOT NULL
    AND c.course IS NOT NULL
),
candidates AS (
  SELECT l.id AS lecture_id, l.user_id, cl.id AS class_item_id, ld.d AS class_date
  FROM lectures l
  JOIN classes cl ON cl.user_id = l.user_id AND cl.course = l.course
  LEFT JOIN user_preferences up ON up.user_id = l.user_id
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(cl.recurrence->>'timeZone', up.time_zone, 'Europe/London') AS date_zone,
      COALESCE(cl.recurrence->>'timeZone', 'UTC') AS wall_zone
  ) z
  CROSS JOIN LATERAL (SELECT (l.starts_at AT TIME ZONE z.date_zone)::date AS d) ld
  WHERE l.class_item_id IS NULL AND l.course IS NOT NULL
    AND (
      (cl.recurrence IS NULL AND (cl.starts_at AT TIME ZONE z.date_zone)::date = ld.d)
      OR (cl.recurrence IS NOT NULL AND EXISTS (
        -- The weeks around the lecture's: occurrence k keeps the series'
        -- first wall-clock time in its zone, k weeks on.
        SELECT 1
        FROM generate_series(
          GREATEST(0, floor(extract(epoch FROM l.starts_at - cl.starts_at) / 604800)::int - 1),
          floor(extract(epoch FROM l.starts_at - cl.starts_at) / 604800)::int + 1
        ) AS k
        CROSS JOIN LATERAL (
          SELECT ((cl.starts_at AT TIME ZONE z.wall_zone) + k * interval '7 days') AT TIME ZONE z.wall_zone AS starts_at
        ) occ
        WHERE (occ.starts_at AT TIME ZONE z.date_zone)::date = ld.d
          AND (cl.recurrence->>'until' IS NULL OR occ.starts_at <= (cl.recurrence->>'until')::timestamptz)
      ))
    )
),
unambiguous AS (
  SELECT c.* FROM candidates c
  WHERE (SELECT count(*) FROM candidates o WHERE o.lecture_id = c.lecture_id) = 1
    AND (SELECT count(*) FROM candidates o
         WHERE o.user_id = c.user_id AND o.class_item_id = c.class_item_id AND o.class_date = c.class_date) = 1
    AND NOT EXISTS (
      SELECT 1 FROM lectures x
      WHERE x.user_id = c.user_id AND x.class_item_id = c.class_item_id AND x.class_date = c.class_date
    )
)
UPDATE lectures l
SET class_item_id = u.class_item_id, class_date = u.class_date
FROM unambiguous u
WHERE l.id = u.lecture_id;
