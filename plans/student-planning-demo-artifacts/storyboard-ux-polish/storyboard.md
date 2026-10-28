# Dress rehearsal storyboard (UX polish pass 1 wrap-up)

Branch `docs/pass1-rehearsal` (from `feat/student-planning-ux` @ ee3eabf), mock AI (`AI_MODE=mock`), fresh `pnpm db:reseed` on `malleable_pls_rehearsal` before each run,
headless Chromium 1440x900, timezone Europe/London, **real clock** for browser and server (Wed 28 Oct 2026, about 12:00): the presenter's situation, not the frozen Tuesday of the e2e rehearsal.
Followed `docs/demo-runbook.md` step by step with a throwaway Playwright driver (kept out of the repo). Light is the default theme; the dark run switched with the top-bar toggle and also tried the runbook's old "drag the Transcript into the right-hand column" option (dark/19).
Every step worked as written in both themes; times differ from the old runbook because of the day (Wednesday) and the earliest-placement / 09:00 study day changes. `e2e/journey-demo.e2e.ts` passes against the same stack.

Screenshots: `light/` (the main run) and `dark/` (same beats; numbering shifts by one from dark/19). Findings are listed at the end with severity.

| Step | Light | Dark | What you see | What to say / hazard | Findings |
|---|---|---|---|---|---|
| 1 | light/01-step1-start.jpg | dark/01-step1-start.jpg | App opens on the seeded study boards (In Lecture). Top bar today line: "Wednesday · Biology 10:00 · 2h to study". Dark run: the sun/moon button in the top bar switches theme. | - | - |
| 1 | light/02-step1-new-board-dialog.jpg | dark/02-step1-new-board-dialog.jpg | + (New board), name "My week", **Create board**. | - | - |
| 1 | light/03-step1-empty-board.jpg | dark/03-step1-empty-board.jpg | Empty board: "This board is yours to build." with three starters (Plan my time, Capture a lecture, Find what to revise) and Add widgets. | Say: "Plan my time" would add the same three widgets in one click; the script builds them one by one from the board menu. | - |
| 1 | light/04-step1-widgets-added-menu-open.jpg | dark/04-step1-widgets-added-menu-open.jpg | Board menu: Calendar, To-do, Coming up added by click; the menu stays open. | - | - |
| 1 | light/05-step1-board-built.jpg | dark/05-step1-board-built.jpg | Week of 26 Oct: lectures, two cafe shifts, Saturday planned study, yesterday's two missed blocks (Tue). Coming up: Biology quiz tomorrow, Chemistry lab report Fri 30 Oct. Calendar and To-do both ask "2 blocks didn't happen. Re-fit them?". | Hazard: Leave the re-fit question for step 6. | F7 |
| 2 | light/06-step2-help-me-plan-open.jpg | dark/06-step2-help-me-plan-open.jpg | **Help me plan**: "Plan your time" floats over Fri-Sun. "About 9 hours of study time left this week (2h a day). Your to-dos need 12." Bar: 9h free, 12h to do, 3h short (hatched). Gaps show "9h 50m free". | Say: The capacity line names the 2h a day cap and agrees with what Auto-fill will use. | - |
| 2 | light/07-step2-assigned-by-hand.jpg | dark/07-step2-assigned-by-hand.jpg | Revise for the Biology quiz: first suggestion "Today 12:15" (12:15-14:15). Now "About 7 hours ... Your to-dos need 10." The today line drops "2h to study" (today is full). | - | - |
| 2 | light/08-step2-autofill-ghosts.jpg | dark/08-step2-autofill-ghosts.jpg | **Auto-fill**: "Lab report write-up (3h) is too long for one day." **Shrink to 2h**. Draft · 3 blocks, "Drafted 5h of study time. 5h didn't fit." | Hazard: On a Wednesday the panel covers the Fri and Sun ghosts. | F3 |
| 2 | light/09-step2-after-shrink.jpg | dark/09-step2-after-shrink.jpg | After Shrink: "Shrunk Lab report write-up to 2h. Undo". "Drafted 5h of study time. 4h didn't fit. The other 2h of free time is in gaps too short for it." Lab write-up Thu 09:00, flashcards Fri 09:00, past paper Sun 09:00; problem sheet and essay named with Pick a time. | - | F13 |
| 2 | light/09b-step2-plan-hidden-ghosts.jpg | - | Optional: » ("Hide the plan to see the calendar") shows every ghost with "3 suggested blocks ... Accept all / Keep my plan"; **Show plan** brings the panel back. | Say: Use this to show the whole draft before accepting. | - |
| 2 | light/10-step2-accepted.jpg | dark/10-step2-accepted.jpg | **Accept draft**: blocks saved; the panel now reads "About 2 hours ... Your to-dos need 4." Close it (x). | - | - |
| 2 | light/11-step2-dragged-block.jpg | dark/11-step2-dragged-block.jpg | Drag Friday's "Make flashcards" block to Saturday 15:00 (15:00-16:00). This frees Friday morning for the review in step 4. | - | - |
| 3 | light/12-step3-menu-course-biology.jpg | dark/12-step3-menu-course-biology.jpg | Board menu, scroll down to Showing, Course: **Biology**. | Hazard: The Course picker is below the fold of the menu at 900px. | F8 |
| 3 | light/13-step3-board-biology.jpg | dark/13-step3-board-biology.jpg | Chip "Showing: Biology", calendar "Biology highlighted" (Chemistry dimmed, shifts kept), Coming up "Biology quiz" + "+1 in other courses", To-do "+3 in other courses". | - | - |
| 4 | light/14-step4-capture-and-transcript-added.jpg | dark/14-step4-capture-and-transcript-added.jpg | Audio Capture and Transcript added from the menu: they land below the calendar and the board scrolls to them. | - | - |
| 4 | light/15-step4-upload-form.jpg | dark/15-step4-upload-form.jpg | Upload arrow next to the mic, pick the demo wav, title "Mitochondrial DNA - today", course pre-set to Biology, **Upload**. | - | - |
| 4 | light/16-step4-transcribing.jpg | dark/16-step4-transcribing.jpg | "Transcribing your lecture..." (about 1.5s in mock), then "Writing your summary...". The upload also adds the lecture to the Showing chip. | - | - |
| 4 | light/17-step4-transcript-and-summary.jpg | dark/17-step4-transcript-and-summary.jpg | About 3s after Upload: 17 segments and a one-line summary. **Show summary** expands it. | Hazard: The open summary is capped at 40% of the Transcript: the third line needs a scroll inside it. | F4 |
| 4 | light/18-step4-capture-removed.jpg | dark/18-step4-capture-removed.jpg | Audio Capture removed with its x. The Transcript stays below the calendar. | - | - |
| 4 | - | dark/19-step4-transcript-right-column.jpg | Dark run only: the runbook's old "drag the Transcript into the right-hand column" option. It lands below the fold and overhangs the column; the calendar is still out of view. Dropped from the runbook. | - | F1 |
| 4 | light/19-step4-moment-selected.jpg | dark/20-step4-moment-selected.jpg | Scroll the Transcript to 1:18 and click "Now, here is the part people find tricky...": the tag bar opens. | - | - |
| 4 | light/20-step4-ripple-in-flight.jpg | dark/21-step4-ripple-in-flight.jpg | **confused**: the "Adding to your plan" card lifts off about 1s later, starting over the Transcript header (the moment's top is scrolled out of the list), and flies up off screen toward the calendar. | Hazard: At 1440x900 the ripple happens almost entirely off screen. | F1 |
| 4 | light/21-step4-confused-review-planned.jpg | dark/22-step4-confused-review-planned.jpg | Toast "Review added to your plan · See it". The chip ("Review planned · Fri 30 Oct 09:00 · 20 min") sits at the end of the 40s moment, below the visible part; the To-do row ("From Mitochondrial DNA - today · 1:18") is above the fold. | - | F1, F7 |
| 4 | light/22-step4-see-it-glow.jpg | dark/23-step4-see-it-glow.jpg | **See it**: the board scrolls up, the review (Fri 09:00-09:20, where the dragged block was) glows in Biology green, and a card shows "From Mitochondrial DNA - today · 1:18 / Fri 09:00 - 09:20 · 20 min". | Say: Earliest free time on a day with study time left: Wed and Thu are full after step 2, so Friday 09:00. | F9 |
| 4 | light/23-step4-review-popover.jpg | dark/24-step4-review-popover.jpg | Click the block: popover leads with "From Mitochondrial DNA - today · 1:18", "You marked this confusing" and the quoted line; **Go to moment**, Mark done, Edit time; footer: Made by "When I mark something confusing, add a 20-min review within 3 days". Edit. | - | F10 |
| 4 | light/24-step4-go-to-moment.jpg | dark/25-step4-go-to-moment.jpg | **Go to moment**: "Showing this moment in the Transcript." The board stays on My week and scrolls down to the Transcript, the 1:18 moment outlined in Biology green. | - | - |
| 4 | light/25-step4-after-escape.jpg | dark/26-step4-after-escape.jpg | Escape closes the popover. | - | - |
| 5 | light/26-step5-automation-sentence.jpg | dark/27-step5-automation-sentence.jpg | Transcript lightning button: "Automations · Transcript", "When I mark something confusing, add a 20-min review within 3 days." | - | - |
| 5 | light/27-step5-automation-edited.jpg | dark/28-step5-automation-edited.jpg | 20 -> 30: "Saved. Your review is now 30 min." | Say: This line is the visible proof; point at it before closing. | - |
| 5 | light/28-step5-block-longer.jpg | dark/29-step5-block-longer.jpg | Closed: the block stays at Fri 09:00 and is now 09:00-09:30 (chip "· 30 min", To-do "30m"), but on the grid it looks exactly the same. | - | F2 |
| 5 | light/29-step5-widget-added.jpg | dark/30-step5-widget-added.jpg | Board menu > **Weakest Topics**: lands in free space below the calendar, the board scrolls to it. | - | F12 |
| 6 | light/30-step6-weak-topic-clicked.jpg | dark/31-step6-weak-topic-clicked.jpg | Weakest Topics: Maternal inheritance (today, Confusing), Mitochondrial disease, Maternal inheritance (seeded, 9:00), Paternal inheritance, ... Click Paternal inheritance: the Transcript switches to the seeded lecture at 27:00 ("Reviewed · 20 min"). | - | F11 |
| 6 | light/31-step6-refit-question.jpg | dark/32-step6-refit-question.jpg | To-do: "2 blocks didn't happen. Re-fit them?" | - | - |
| 6 | light/32-step6-refit-preview.jpg | dark/33-step6-refit-preview.jpg | **Re-fit**: "Here is where they could go: Read lecture notes: cell division Today 14:15, Practice questions: cell structure Today 15:15" with **Move them** / Keep my plan. | - | F5, F6 |
| 6 | light/33-step6-refit-moved.jpg | dark/34-step6-refit-moved.jpg | **Move them**: "Moved 2 blocks. They're in your calendar." | - | F5 |

## Findings

| # | Severity | Step | What happened | Screenshots |
|---|---|---|---|---|
| F1 | High | 4 | The confused-to-calendar ripple happens off screen at 1440x900. After the upload the Transcript sits below the calendar, so the calendar target (Fri 09:00) and the To-do row are scrolled out of view. The Transcript is ~380px tall: with the tag bar open only ~100px of the moment shows, and the amber chip (end of the 40s moment) is hidden. The lift-off card starts over the Transcript header (anchored to the moment top, which is scrolled out of the list), overlapping the title and legend, then flies off screen. Dragging the Transcript to the right column (old runbook option) does not help. | light/19-21, dark/19, dark/21-22 |
| F2 | Medium | 5 | Editing 20 -> 30 min has no visible effect on the calendar: the review block renders 22px tall at both lengths (minimum block height at the default hour height), and the chip is out of view. Only the dialog line "Saved. Your review is now 30 min." shows the change. | light/27-28 |
| F3 | Medium | 2 | Help me plan floats over Fri-Sun, which on a Wednesday hides the Fri and Sun ghost blocks Auto-fill drafts; only Thursday's is visible. » shows them but is easy to miss. | light/08-09, light/09b |
| F4 | Low | 4 | Show summary in a default-size Transcript is capped at 40% height: the third summary line is cut off and needs a scroll inside the summary box. | light/17 |
| F5 | Low | 6 | Re-fit ignores the 2h a day budget and the 10-minute gap the other placements keep: at noon on Wednesday both missed blocks go Today 14:15 and 15:15, back to back after the 2h quiz revision (4h of study today) even though the today line said 2h. | light/32-33 |
| F6 | Low | 6 | Two re-fit banners: after Re-fit in To-do shows its preview, the Calendar banner still asks "Re-fit them?". | light/32 |
| F7 | Low | 1, 4 | "<Widget> added" and "Transcript ready" toasts (4s, 8s with an action) sit bottom-right over the widgets there: the bottom of Coming up, and the Transcript tag bar when it is in the right column. Stacked toasts cover more. Milder than the T11c storyboard, but still in the shot at most beats. | light/05, dark/22 |
| F8 | Low | 3 | Board menu: Showing > Course is below the fold at 900px; the presenter has to scroll the menu. | light/12 |
| F9 | Low | 4, 6 | After See it and after re-fit the calendar grid scrolls to 04:00-05:00, showing empty night hours above the day. | light/22, light/33 |
| F10 | Low | 4 | The See it reveal card stays up when the block popover opens, so the two overlap; the popover source line wraps "1:18" onto its own line. | light/23 |
| F11 | Low | 6 | Clicking a seeded weak topic re-scopes the board to the seeded lecture ("Showing: Biology · Biology Lecture: Mitochondrial DNA"), and the today line loses "Wednesday" for room. Probably intended, but it changes the board under the presenter. | light/30 |
| F12 | Low (U7) | 5-6 | Weakest Topics still has pre-U1 styling: uppercase "6 TO REVIEW", monospace "20% sure", low-contrast meta in dark. | dark/30 |
| F13 | Low | 2 | Copy: "The other 2h of free time is in gaps too short for it." when two to-dos didn't fit ("for them"). | light/09 |
| F14 | Nit | 1 | The today line still lists "Biology 10:00" at noon, after the lecture ended. | light/01 |

Not fixed here (product code is out of scope for this PR); listed for dispatch.
