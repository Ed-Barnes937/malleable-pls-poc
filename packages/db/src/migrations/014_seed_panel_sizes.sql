-- Migration 014: Resize the seeded study boards for the redesigned widget chrome
-- The redesign (student planning U1) gives every widget a taller header and
-- roomier padding, so the panels 008_seed_panels.sql placed lost content:
-- Test Me's Reveal Answer was cut off and Weakest Topics showed fewer topics.
-- Each panel is only resized while it still has its seeded geometry, so a
-- board someone has rearranged is left alone. Fits a 1440x900 window.
--
-- Also run by e2e/reseed.ts after 008_seed_panels.sql. Safe to re-run.

UPDATE workspace_panels AS p
SET pos_x = v.new_x, pos_y = v.new_y, width = v.new_w, height = v.new_h
FROM (VALUES
  -- id,    seeded x, y, w, h,       new x, y, w, h
  ('wp-3',  40,  40, 460, 400,       40,  40, 460, 420),
  ('wp-4',  540, 40, 360, 300,       540, 40, 420, 460),
  ('wp-5',  40, 480, 300, 260,       40, 500, 300, 300),
  ('wp-6',  540, 380, 480, 340,      540, 540, 480, 280),
  ('wp-7',  40,  40, 720, 240,       40,  40, 760, 250),
  ('wp-8',  40, 320, 300, 420,       40, 330, 340, 470),
  ('wp-9',  380, 320, 420, 300,      420, 330, 420, 470)
) AS v(id, old_x, old_y, old_w, old_h, new_x, new_y, new_w, new_h)
WHERE p.id = v.id
  AND p.user_id = 'dev-user-1'
  AND p.pos_x = v.old_x AND p.pos_y = v.old_y
  AND p.width = v.old_w AND p.height = v.old_h;
