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

## 2026-10-27 (Ed, from U3 and U6 questions)
11. A confusion review respects the daily budget when any day in its window has room. If none does, it goes in the earliest free slot anyway (over budget as a last resort). It is unscheduled only when there is no free slot at all.
12. The server's review placement uses the default 2h/day until S1's study-hours preference exists.
13. The phone top bar follows the mock-up (menu, tabs, widgets button), with Automations, Theme and Settings moved into the menu. Small follow-up ticket U6b after U6 merges; it also covers showing the today line on the phone (mock-up 5).

## 2026-10-28 (Ed)
14. Migrations 014 and 015 accidentally applied to the default `malleable_pls` DB stay in place (additive, needed by pass 1 anyway).
15. Fix the DB URL footgun: scripts honour `DATABASE_URL` when set (small fix ticket).

## 2026-10-28 (orchestrator, cheap to reverse)
16. U6b: on a phone, Activity and the theme toggle move into the existing board menu rather than a new dropdown.
17. U6b: the phone today line keeps U5's rule and hides when today has no class or shift, even if study time is left.

## 2026-10-28 (Ed, from the pass-1 rehearsal)
18. The app follows the confused-to-calendar ripple: when a review is placed, the board scrolls so the Calendar block (or the To-do row) is in view as the card lands, and the card starts from the moment's visible position. Works for any layout.
19. Mid-week, the floating Plan your time panel covers days already past (e.g. Mon-Tue on a Wednesday), falling back to the weekend early in the week.
20. (Ed) Re-fit goes over the daily budget as a last resort, same rule as confusion reviews (decision 11): respect the cap when any day before the deadline has room, otherwise the earliest free slot before it is due.
21. (Orchestrator, cheap to reverse) At 1440x900 with the Transcript below the Calendar, when the review block and the moment's chip can't both be on screen, the ripple shows the block; the chip stays visible inside the Transcript list.

## 2026-10-29 (Ed, R1 escalation after round 3)
22. Simplify the toast bar: a fixed overlay bar with a permanent reserved bottom space on the board, instead of an in-flow bar plus scroll-slack restore. Nothing resizes when toasts come and go, so nothing can fight the ripple's glide.

## 2026-10-29 (orchestrator, cheap to reverse)
23. Draft leftover copy when the daily budget is the limit: "The other 1h is on days with too little study time left for them." (singular "...for it."). Combined: "The other 1h of free time is in gaps too short for them, and 30m is on days with too little study time left for them."

## 2026-10-29 (orchestrator, cheap to reverse)
24. A widget added by click is shortened (down to its minimum height) to land fully in view only on the desktop layout and only when the board already has widgets. On a phone or an empty board it keeps its default height, so a layout saved from a small screen doesn't shrink widgets on desktop.
