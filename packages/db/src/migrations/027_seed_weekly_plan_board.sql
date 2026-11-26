-- Migration 027: Seed a Weekly plan board
-- dev-user-1 gets a fourth board after In Lecture, Exam Prep and Evening
-- Review: the "Plan my time" starter's widgets (Calendar, To-do, Coming up),
-- placed as that starter places them on a 1440x900 window, for all courses
-- (no scope rows, like a Plan my time board made with no course picked).
-- sort_order 3 is after the three older boards.
--
-- Run by e2e/reseed.ts after the older seed files. Only the seeded student
-- has these rows: ON CONFLICT leaves a board someone has since rearranged alone.

INSERT INTO workspaces (id, user_id, name, sort_order, created_at) VALUES
  ('ws-weekly-plan', 'dev-user-1', 'Weekly plan', 3, '2026-03-28T09:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO workspace_panels (id, user_id, workspace_id, lens_type, slot_name, config, pos_x, pos_y, width, height, z_index, created_at) VALUES
  ('wp-10', 'dev-user-1', 'ws-weekly-plan', 'calendar',  'calendar',  '{}',  20,  20, 900, 731, 0, '2026-03-28T09:00:00Z'),
  ('wp-11', 'dev-user-1', 'ws-weekly-plan', 'todo',      'todo',      '{}', 940,  20, 360, 411, 0, '2026-03-28T09:00:00Z'),
  ('wp-12', 'dev-user-1', 'ws-weekly-plan', 'coming-up', 'coming-up', '{}', 940, 451, 360, 299, 0, '2026-03-28T09:00:00Z')
ON CONFLICT (id) DO NOTHING;
