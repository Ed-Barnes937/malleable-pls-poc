# Dress rehearsal storyboard (T11c, round 2: after merging T10b)

Branch `feat/t11c-demo-kit`, mock AI, fresh `SEED_NOW=2026-10-27T10:30:00Z pnpm db:reseed` on `malleable_pls_t14`,
headless Chromium 1440x900, timezone Europe/London, browser clock fixed at Tue 27 Oct 2026 10:30.
Driver script: `../rehearsal/run.mts` (log: `../rehearsal/run-v2.log`). Since T10b the Calendar shows its own re-fit banner from step 1, which shortens the grid (it scrolls; evenings need a scroll). Upload title is now "Mitochondrial DNA - today". The server ran on the real clock (Tue 27 Oct, ~02:00),
which only matters where noted.

| # | Screenshot | Caption | Problems |
|---|---|---|---|
| 1 | 01-step1-start.png | App opens on the seeded study boards. | - |
| 1 | 02-step1-new-board-dialog.png | "New board" dialog, name "My week". | - |
| 1 | 03-step1-empty-board.png | Empty board with its empty-state prompt. | - |
| 1 | 04-step1-widgets-added-drawer-open.png | Calendar, To-do, Coming up added by click; drawer stays open. | - |
| 1 | 05-step1-board-built.png | Week of 26 Oct: lectures, two cafe shifts, Sat/Sun planned study, Mon's two missed blocks; Coming up: quiz Thu, lab report Fri; To-do has the re-fit banner. | "Coming up added" toast lingers in the corner. |
| 2 | 06-step2-help-me-plan-open.png | Help me plan: "About 9 hours of study time left this week. Your to-dos need 12." 3h over. | - |
| 2 | 07-step2-assigned-by-hand.png | Quiz revision placed by hand at "Today 10:30" (10:30-12:30); now 7h left, need 10. | - |
| 2 | 08-step2-autofill-ghosts.png | Auto-fill ghosts; trim "Shrink 'Lab report write-up' to 2h? (now 3h)"; essay + lab report listed as didn't fit. | Calendar columns get narrow with the panel open (titles truncate). |
| 2 | 09-step2-after-shrink.png | After Shrink: "Drafted 5h of study time. 4h didn't fit." Lab write-up Wed 12:15-14:15. | 1h each on Thu and Sun stays unused: every remaining to-do is 2h (honest, but someone may ask). |
| 2 | 10-step2-accepted.png | Accept all: blocks saved. | - |
| 2 | 11-step2-dragged-block.png | Chemistry past paper dragged Fri 08:00 -> 13:00. | - |
| 3 | 12-step3-drawer-course-biology.png | Drawer, Showing: Course = Biology. | - |
| 3 | 13-step3-board-biology.png | Chip "Showing: Biology", calendar "Biology highlighted" (Chemistry dimmed, shifts kept), Coming up "Biology quiz" + "+1 in other courses", To-do "+4 in other courses". | - |
| 4 | 14-step4-capture-and-transcript-added.png | Audio Capture and Transcript added by click. | Both land over the calendar / Coming up (board full): T13 is fixing add-on-full-board overlap. |
| 4 | 15-step4-upload-form.png | Upload form, course pre-filled Biology from the board. | - |
| 4 | 16-step4-transcript-and-summary.png | Transcript (17 moments, real demo text via the hash cache) and a 3-line summary. | - |
| 4 | 17-step4-capture-removed.png | Audio Capture removed with a click (frees the calendar's evenings). | - |
| 4 | 18-step4-moment-selected.png | Maternal-inheritance moment (1:18) selected. | - |
| 4 | 19-step4-confused-review-planned.png | "confused" -> chip "Review planned Fri 9:30 PM · 20 min"; To-do "Review: maternal inheritance · from: Mitochondrial DNA - today, 1:18". | Lands Fri 21:30, not Wednesday evening (as late as possible within 3 days); block sits at the very bottom of the grid. Chip shows "9:30 PM" (T13 fixing 24h). Fixed here: mock title was "Review: heteroplasmy". |
| 4 | 20-step4-clicked-review-block.png | Clicking the block: popover "From: Mitochondrial DNA, 1:18 - Showing this moment in the Transcript." | - |
| 5 | 21-step5-automation-sentence.png | Transcript automations: "When I mark something confusing, add a 20-min review within 3 days". | The block popover from step 4 stays open behind the dialog: press Escape first. |
| 5 | 22-step5-automation-edited.png | 30 min, by tomorrow: "Saved. Moved 1 review to fit." | The open block popover keeps showing the old 21:30-21:50 times (stale until reopened). |
| 5 | 23-step5-block-moved.png | Review now Wed 21:30-22:00, chip "Wed 9:30 PM · 30 min". | - |
| 5 | 24-step5-widget-added.png | Weakest Topics added by click. | Lands over the calendar (T13). |
| 6 | 25-step6-weak-topic-clicked.png | Weak topics: Maternal inheritance (today's lecture, Confusing), Mitochondrial disease, Maternal inheritance (seeded lecture), Paternal inheritance...; clicking Paternal inheritance jumps to 27:00 of the seeded lecture, which shows "Reviewed · 20 min". | Two "Maternal inheritance" rows (seeded lecture 9:00 and today's 1:18), now told apart by the "- today" title. |
| 6 | 26-step6-refit-question.png | To-do: "2 blocks didn't happen. Re-fit them?" (yesterday's two seeded blocks). | - |
| 6 | 27-step6-refit-preview.png | Preview: both go "Today 08:00 / 09:00". | Rehearsal artefact: re-fit runs on the server's clock (02:00), the browser is frozen at 10:30, so the times look past. Live, server and browser agree. |
| 6 | 28-step6-refit-moved.png | "Moved 2 blocks. They're in your calendar." | - |

Fixed on this branch: the mock review title (keyPhrase took "which we call heteroplasmy" over "let me explain maternal
inheritance"); seeded April reviews showed under To-do's "Done today" (now dated in April).
Not fixed (out of scope / T13): widget overlap on a full board, 12h chip time, lingering toasts, stale block popover.
