-- Add CHECK constraints on status columns to prevent invalid state values.
-- Only constraining the two tables most likely to receive invalid status values;
-- extensible type columns (target_type, anchor_type, etc.) are left unconstrained.

ALTER TABLE recordings ADD CONSTRAINT chk_recordings_status
  CHECK (status IN ('ready', 'uploaded', 'processing', 'completed', 'failed'));

ALTER TABLE job_runs ADD CONSTRAINT chk_job_runs_status
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'retrying'));
