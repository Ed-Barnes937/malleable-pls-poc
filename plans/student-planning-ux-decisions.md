# Student Planning UX Polish - Decisions during the run

## 2026-10-27 (Ed, from S1 findings, applies to U3)
1. Confusion reviews count against the daily study budget (2h/day). A day already at its cap is skipped.
2. Confusion reviews keep the same 10m gap between blocks that Help me plan uses.
3. Confusion reviews get a 1h lead time: never placed within the next hour after marking.

S1 product questions (default window end, per-weekday shape, moving the budget into a user preference, binding automation only) are open for pass 2. See `plans/student-planning-s1-available-times.md`.

## 2026-10-27 (Ed, from U1 questions)
4. Light becomes the default theme (U1 fix-up round).
5. Physics colours are violet.
6. Recordings carry a course in the reader contract. Done in U4 (migration, store, substrate types, simulator). Existing rows fall back to today's guess (board course, then the lecture's reviews).

## 2026-10-27 (orchestrator, cheap to reverse)
7. U5 today line reads "2h to study" (study time left today, capped by the daily budget) instead of the mock-up's "2h free", because Help me plan uses "free" for all unbooked time.
8. "Do by" and "How long?" ship in the To-do widget as part of U2 (the mock-up shows them there); U6 doesn't repeat them.

## 2026-10-27 (Ed, from U4 questions)
9. "Go to moment" prefers a board whose Transcript is in review mode, then falls back to tab order. No new data.
10. Recording course is read from the recording's course-label tags (oldest first). No new column; this replaces the "migration" wording of decision 6.
