-- Migration 013: Lecture AI automations
-- 1. Drop the stub jobs that reported success while doing nothing
--    (search:related-docs, schedule:quiz, ai:generate-questions,
--    ai:find-connections). Their executors are gone, so any automation still
--    using them would only fail. Automations built only on them go too
--    (built-in and board copies), and queued runs of them are dropped.
-- 2. Seed the two real lecture automations:
--    - "When a lecture transcript is ready, write a 3-line summary"
--    - "When I mark something confusing, add a 20-min review within 3 days"
--    Day boundaries use Europe/London until users have a time zone preference;
--    the sentence editor stores the browser's zone when the student edits it.
-- Guarded so it is safe to re-run (e2e/reseed.ts replays it after 002).

-- Removed job types, for every user. Runs still queued would fail later with
-- "Unknown job type", so they go; finished runs stay as history.
DELETE FROM job_runs
WHERE job_type IN ('search:related-docs', 'schedule:quiz', 'ai:generate-questions', 'ai:find-connections')
  AND status IN ('pending', 'running');

-- Automations (built-in or board copies) whose every step was a stub would be
-- left empty, and a board copy would then shadow the new automation with the
-- same trigger on that board. They go; mixed ones just lose the stub steps.
DELETE FROM workflows w
WHERE EXISTS (
    SELECT 1 FROM workflow_jobs wj
    WHERE wj.workflow_id = w.id
      AND wj.job_type IN ('search:related-docs', 'schedule:quiz', 'ai:generate-questions', 'ai:find-connections')
  )
  AND NOT EXISTS (
    SELECT 1 FROM workflow_jobs wj
    WHERE wj.workflow_id = w.id
      AND wj.job_type NOT IN ('search:related-docs', 'schedule:quiz', 'ai:generate-questions', 'ai:find-connections')
  );

DELETE FROM workflow_jobs
WHERE job_type IN ('search:related-docs', 'schedule:quiz', 'ai:generate-questions', 'ai:find-connections');

INSERT INTO workflows (id, user_id, source_lens, trigger_event, condition_field, condition_value, enabled, workspace_id, created_at)
SELECT v.id, 'dev-user-1', v.source_lens, v.trigger_event, v.condition_field, v.condition_value, true, NULL, '2026-03-28T09:00:00Z'
FROM (VALUES
  ('wf-lecture-summary', 'audio-capture', 'recording:transcribed', NULL,    NULL),
  ('wf-confused-review', 'transcript',    'tag:created',           'label', 'confused')
) AS v(id, source_lens, trigger_event, condition_field, condition_value)
WHERE EXISTS (SELECT 1 FROM workflows WHERE id = 'wf-audio-transcribe' AND user_id = 'dev-user-1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO workflow_jobs (id, user_id, workflow_id, job_type, params, sort_order, delay_ms)
SELECT v.id, 'dev-user-1', v.workflow_id, v.job_type, v.params::jsonb, 0, 0
FROM (VALUES
  ('wfj-lecture-summary', 'wf-lecture-summary', 'ai:summarize-lecture', '{}'),
  ('wfj-confused-review', 'wf-confused-review', 'plan:review-task',     '{"durationMin": 20, "windowDays": 3, "timeZone": "Europe/London"}')
) AS v(id, workflow_id, job_type, params)
JOIN workflows w ON w.id = v.workflow_id AND w.user_id = 'dev-user-1'
ON CONFLICT (id) DO NOTHING;
