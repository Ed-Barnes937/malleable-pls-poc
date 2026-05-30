-- Migration 008: Seed freeform-canvas panels
-- The original panel seed lived in 002_seed.sql using grid columns, but
-- migration 006 deleted those rows and switched to pixel-based positioning.
-- This re-seeds the demo panels with pixel coordinates and varied sizes so
-- each workspace shows a realistic, non-uniform layout.

INSERT INTO workspace_panels (id, user_id, workspace_id, lens_type, slot_name, config, pos_x, pos_y, width, height, z_index, created_at) VALUES
  -- In Lecture: a compact capture control beside a tall transcript
  ('wp-1',  'dev-user-1', 'ws-in-lecture',     'audio-capture',   'sidebar',      '{"recordingId":"rec-bio-4"}',                                    40,  40, 320, 240, 0, '2026-03-28T09:00:00Z'),
  ('wp-1b', 'dev-user-1', 'ws-in-lecture',     'transcript',      'main',         '{"recordingId":"rec-bio-4","mode":"capture"}',                  400,  40, 560, 620, 0, '2026-03-28T09:00:00Z'),
  -- Evening Review: four differently-sized panels
  ('wp-3',  'dev-user-1', 'ws-evening-review', 'transcript',      'top-left',     '{"recordingId":"rec-bio-4","mode":"review"}',                    40,  40, 460, 400, 0, '2026-03-28T09:00:00Z'),
  ('wp-4',  'dev-user-1', 'ws-evening-review', 'test-me',         'top-right',    '{"mode":"review"}',                                             540,  40, 360, 300, 0, '2026-03-28T09:00:00Z'),
  ('wp-5',  'dev-user-1', 'ws-evening-review', 'weekly-overview', 'bottom-left',  '{}',                                                             40, 480, 300, 260, 0, '2026-03-28T09:00:00Z'),
  ('wp-6',  'dev-user-1', 'ws-evening-review', 'connections',     'bottom-right', '{"conceptLabel":"mitochondrial DNA","recordingId":"rec-bio-4"}', 540, 380, 480, 340, 0, '2026-03-28T09:00:00Z'),
  -- Exam Prep: a wide banner over two stacked panels
  ('wp-7',  'dev-user-1', 'ws-exam-prep',      'gap-analysis',    'top-full',     '{}',                                                             40,  40, 720, 240, 0, '2026-03-28T09:00:00Z'),
  ('wp-8',  'dev-user-1', 'ws-exam-prep',      'weakest-topics',  'bottom-left',  '{}',                                                             40, 320, 300, 420, 0, '2026-03-28T09:00:00Z'),
  ('wp-9',  'dev-user-1', 'ws-exam-prep',      'test-me',         'bottom-right', '{"mode":"exam","timerSeconds":120}',                            380, 320, 420, 300, 0, '2026-03-28T09:00:00Z');
