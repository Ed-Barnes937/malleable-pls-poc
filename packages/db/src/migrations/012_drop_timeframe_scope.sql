-- Migration 012: Drop the 'timeframe' workspace scope
-- No reader ever applied the board timeframe, so the picker and chip claimed
-- a filter nothing honoured. Widgets that show a window of time now own their
-- own date range (see `DateRange` in packages/lens-framework), so the
-- dimension is removed rather than half-implemented.
--
-- Also run by e2e/reseed.ts after 002_seed.sql, which still inserts the
-- original timeframe rows. Safe to re-run.

DELETE FROM workspace_scopes WHERE scope_type = 'timeframe';
