-- Migration 016: user_preferences
-- One row per user for the settings every widget and the server must agree
-- on: when the student is willing to study (study hours, per weekday), how
-- much study a day (the daily budget) and their time zone. A NULL column
-- means "use the default" (09:00-22:00 every day, 2h a day, the browser's
-- zone), so no backfill is needed and a missing row is all defaults.
--
-- study_hours: { "mon": {"start": "09:00", "end": "22:00"} | null, ... "sun": ... }
-- One window per weekday, local time; null = no study that day. An end at or
-- before the start runs past midnight; "24:00" is allowed as an end.

-- True for one weekday's entry: JSON null, or exactly { start, end } as HH:MM
-- (end may be 24:00) with start <> end.
CREATE FUNCTION is_study_window(w JSONB) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT w IS NOT NULL AND (
    jsonb_typeof(w) = 'null'
    OR (
      jsonb_typeof(w) = 'object'
      AND (SELECT count(*) FROM jsonb_object_keys(w)) = 2
      AND jsonb_typeof(w->'start') = 'string'
      AND jsonb_typeof(w->'end') = 'string'
      AND w->>'start' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND w->>'end' ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
      AND w->>'start' <> w->>'end'
    )
  )
$$;

-- True for a whole study_hours value: an object with exactly the seven
-- weekday keys, each a valid entry. (A function because CHECK constraints
-- can't hold subqueries.)
CREATE FUNCTION is_study_hours(h JSONB) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(h) = 'object'
    AND (SELECT count(*) FROM jsonb_object_keys(h)) = 7
    AND h ?& ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    AND is_study_window(h->'mon')
    AND is_study_window(h->'tue')
    AND is_study_window(h->'wed')
    AND is_study_window(h->'thu')
    AND is_study_window(h->'fri')
    AND is_study_window(h->'sat')
    AND is_study_window(h->'sun')
$$;

CREATE TABLE user_preferences (
  user_id           TEXT PRIMARY KEY,
  -- IANA zone, e.g. Europe/London.
  time_zone         TEXT,
  study_hours       JSONB,
  -- The daily study budget, in minutes.
  study_min_per_day INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_user_preferences_time_zone CHECK (
    time_zone IS NULL OR char_length(time_zone) BETWEEN 1 AND 100
  ),
  CONSTRAINT chk_user_preferences_study_min_per_day CHECK (
    study_min_per_day IS NULL OR study_min_per_day BETWEEN 15 AND 840
  ),
  CONSTRAINT chk_user_preferences_study_hours CHECK (study_hours IS NULL OR is_study_hours(study_hours))
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON user_preferences
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON user_preferences TO pls_app;
