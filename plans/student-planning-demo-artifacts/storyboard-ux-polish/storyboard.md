# Dress rehearsal storyboard (UX polish pass 1 wrap-up, round 2)

Round 2, after R1 (#92), R2 (#91), #95, #93 and #94. Branch `docs/pass1-rehearsal` merged with `feat/student-planning-ux` @ ab8de12, mock AI, DB `malleable_pls_rehearsal`, headless Chromium 1440x900, Europe/London.

**Main run (light/, dark/): Tuesday 27 Oct 10:30**, the runbook's example day. Seeded with `SEED_NOW=2026-10-27T10:30:00Z`, the browser clock set to that instant and ticking, and the API process clock shifted to the same instant by a scratchpad-only preload. The database clock could not be shifted; that only shows in step 5 (noted there).

**Real-clock run (thursday/): Thursday 29 Oct, about 11:20**, light and dark; a subset of its screenshots is here to show the mid-week panel placement and late-week behaviour.

Driver: a throwaway Playwright script following `docs/demo-runbook.md` (kept out of the repo). Every step worked in all four runs. `e2e/journey-demo.e2e.ts` passes against the same stack. Screenshots are JPEG q40.

Findings: F1-F14 from round 1 with their status, N1-N5 new. Table at the end.

| Step | Light | Dark | What you see | Say / hazard | Findings |
|---|---|---|---|---|---|
| 1 | light/01-step1-start.jpg | dark/01-step1-start.jpg | App opens on the seeded In Lecture board. Today line: "Tuesday · Chemistry 14:00 · shift 17:00-22:00 · 2h to study". Dark run: the sun/moon button switches theme. | - | F14 fixed |
| 1 | light/02-step1-new-board-dialog.jpg | dark/02-step1-new-board-dialog.jpg | + (New board), name "My week", **Create board**. | - | - |
| 1 | light/03-step1-empty-board.jpg | dark/03-step1-empty-board.jpg | Empty board: "This board is yours to build." with three starters and Add widgets. | - | - |
| 1 | light/04-step1-widgets-added-menu-open.jpg | dark/04-step1-widgets-added-menu-open.jpg | Board menu: Showing (Course, Lecture) now at the top, then the widgets. Calendar, To-do, Coming up added by click. | - | F8 fixed |
| 1 | light/05-step1-board-built.jpg | dark/05-step1-board-built.jpg | Week of 26 Oct: lectures, two cafe shifts, Saturday and Sunday planned study, yesterday's two missed blocks. Coming up: quiz Thu 29 Oct, lab report Fri 30 Oct. Toasts sit in their own strip under the board. | Hazard: The board is left scrolled about 60px: the Calendar and To-do headers sit under the top bar. | F7 fixed, N1 |
| 2 | light/06-step2-help-me-plan-open.jpg | dark/06-step2-help-me-plan-open.jpg | **Help me plan**: on a Tuesday "Plan your time" floats over Sat-Sun. "About 9 hours of study time left this week (2h a day). Your to-dos need 12."; gaps show "3h 20m free". | - | F3 fixed, N2 |
| 2 | light/07-step2-assigned-by-hand.jpg | dark/07-step2-assigned-by-hand.jpg | Quiz revision at its first suggestion, "Today 10:45" (10:45-12:45). Now 7 hours / 10. | - | - |
| 2 | light/08-step2-autofill-ghosts.jpg | dark/08-step2-autofill-ghosts.jpg | **Auto-fill**: "Lab report write-up (3h) is too long for one day." Draft: flashcards Wed 12:15, past paper Thu 09:00, problem sheet Fri 09:00. | - | - |
| 2 | light/09-step2-after-shrink.jpg | dark/09-step2-after-shrink.jpg | **Shrink to 2h**: "Drafted 5h of study time. 4h didn't fit. The other 2h is on days with too little study time left for them." Lab write-up Wed 12:15, flashcards Thu 09:00, past paper Fri 09:00. | Hazard: The panel is narrow over the weekend: the capacity line scrolls away and only two draft rows show. | F13 fixed, N2 |
| 2 | light/10-step2-plan-hidden-ghosts.jpg | dark/10-step2-plan-hidden-ghosts.jpg | Optional: » shows every ghost ("3 suggested blocks ... Accept all / Keep my plan"); Show plan brings the panel back. | - | - |
| 2 | light/11-step2-accepted.jpg | dark/11-step2-accepted.jpg | **Accept draft**: "About 2 hours ... Your to-dos need 4." Close (x). | - | - |
| 2 | light/12-step2-dragged-block.jpg | dark/12-step2-dragged-block.jpg | Drag Thursday's "Make flashcards" (the earliest Auto-fill block that isn't the lab write-up) to Saturday 15:00. | - | - |
| 3 | light/13-step3-menu-course-biology.jpg | dark/13-step3-menu-course-biology.jpg | Board menu > Showing > Course: **Biology** (top of the menu). | - | F8 fixed |
| 3 | light/14-step3-board-biology.jpg | dark/14-step3-board-biology.jpg | "Showing: Biology", "Biology highlighted", Coming up "+1 in other courses", To-do "+4 in other courses". | - | - |
| 4 | light/15-step4-capture-and-transcript-added.jpg | dark/15-step4-capture-and-transcript-added.jpg | Audio Capture and Transcript land below the calendar; the board scrolls to them. | - | - |
| 4 | light/16-step4-upload-form.jpg | dark/16-step4-upload-form.jpg | Upload arrow, demo wav, "Mitochondrial DNA - today", Biology pre-set, **Upload**. | - | - |
| 4 | light/17-step4-transcribing.jpg | dark/17-step4-transcribing.jpg | "Transcribing your lecture...". | - | - |
| 4 | light/18-step4-transcript-and-summary.jpg | dark/18-step4-transcript-and-summary.jpg | About 3.5s: 17 segments; **Show summary** opens all three lines in full. | - | F4 fixed |
| 4 | light/19-step4-capture-removed.jpg | dark/19-step4-capture-removed.jpg | Audio Capture removed; the Transcript stays under the calendar. | - | - |
| 4 | light/20-step4-moment-selected.jpg | dark/20-step4-moment-selected.jpg | Scroll to 1:18, click "Now, here is the part people find tricky...". | - | - |
| 4 | light/21-step4-ripple-lift.jpg | dark/21-step4-ripple-lift.jpg | **confused**: about 0.9s later the chip "Review planned · Thu 29 Oct 09:00 · 20 min" appears at the end of the moment, in view, with the toast; the "Adding to your plan" card lifts off next. | - | F1 fixed |
| 4 | light/22-step4-ripple-flight.jpg | dark/22-step4-ripple-flight.jpg | The board glides up with the card toward Thursday 09:00; the To-do row ("From Mitochondrial DNA - today · 1:18") is in view. | - | F1 fixed |
| 4 | light/23-step4-ripple-landed.jpg | dark/23-step4-ripple-landed.jpg | Landed: the block glows in Biology green with the "Review: maternal inheritance / From ... · 1:18 / Thu 09:00 - 09:20" card; toast "Review added to your plan · See it". | - | N3 |
| 4 | light/24-step4-confused-review-planned.jpg | dark/24-step4-confused-review-planned.jpg | Same view a moment later. | - | - |
| 4 | light/25-step4-see-it-glow.jpg | dark/25-step4-see-it-glow.jpg | **See it** shows it again (glow + card); the grid stays on 08:00-22:00. | - | F9 fixed |
| 4 | light/26-step4-review-popover.jpg | dark/26-step4-review-popover.jpg | Click the block: the reveal card is gone, the popover leads with "From Mitochondrial DNA - today · 1:18", "You marked this confusing", Go to moment, Mark done, Edit time, Made by ... Edit. | - | F10 fixed, N5 |
| 4 | light/27-step4-go-to-moment.jpg | dark/27-step4-go-to-moment.jpg | **Go to moment**: "Showing this moment in the Transcript."; stays on My week and scrolls to the outlined moment. | - | - |
| 4 | light/28-step4-after-escape.jpg | dark/28-step4-after-escape.jpg | Escape. | - | - |
| 5 | light/29-step5-automation-sentence.jpg | dark/29-step5-automation-sentence.jpg | "When I mark something confusing, add a 20-min review within 3 days." | - | - |
| 5 | light/30-step5-automation-edited.jpg | dark/30-step5-automation-edited.jpg | 20 -> 30. This Tuesday run says "Saved. Moved 1 review to fit." and moves it to 12:30: a harness artefact (the server clock was shifted to Tuesday but the database clock, which stamps when the review was made, was not). On the real clock (thursday/30) it says "Saved. Your review is now 30 min." and stays put. | Hazard: Harness artefact, not product behaviour. | - |
| 5 | light/31-step5-block-longer.jpg | dark/31-step5-block-longer.jpg | The block grows from 9px to 15px tall (20 -> 30 min); chip "· 30 min". | - | F2 fixed, N3 |
| 5 | light/32-step5-widget-added.jpg | dark/32-step5-widget-added.jpg | Board menu > **Weakest Topics**, lands bottom-left, the board scrolls to it. | - | F12 deferred (U7) |
| 6 | light/33-step6-weak-topic-clicked.jpg | dark/33-step6-weak-topic-clicked.jpg | Click Paternal inheritance: the board switches to the seeded lecture at 27:00 ("Reviewed · 20 min") with the toast "Opened 27:00 in Biology Lecture: Mitochondrial DNA · Back to Mitochondrial DNA - today". | - | F11 fixed |
| 6 | light/34-step6-refit-question.jpg | dark/34-step6-refit-question.jpg | To-do: "2 blocks didn't happen. Re-fit them?" | - | - |
| 6 | light/35-step6-refit-preview.jpg | dark/35-step6-refit-preview.jpg | **Re-fit**: "Here is where they could go:" with one per day within the 2h budget; the Calendar's banner steps aside while the preview is up. **Move them** / Keep my plan. | - | F5 fixed, F6 fixed |
| 6 | light/36-step6-refit-moved.jpg | dark/36-step6-refit-moved.jpg | "Moved 2 blocks. They're in your calendar." | - | - |

## Real clock, Thursday (light)

| Screenshot | What you see |
|---|---|
| thursday/01-step1-start.jpg | Thursday 11:20: today line "Thursday · shift 17:00-22:00 · 2h to study" (the morning lecture is gone). |
| thursday/06-step2-help-me-plan-open.jpg | Mid-week the panel floats over Mon-Wed (days already past), full width. "About 8 hours ... Your to-dos need 12." The quiz has passed, so its revision is due Thu 5 Nov. |
| thursday/09-step2-after-shrink.jpg | "Drafted 5h of study time. 4h didn't fit. The other 1h is on days with too little study time left for them." |
| thursday/23-step4-ripple-landed.jpg | The review lands at Sat 09:00, where the dragged block was; the board followed the ripple. |
| thursday/30-step5-automation-edited.jpg | Real clock: "Saved. Your review is now 30 min." |
| thursday/31-step5-block-longer.jpg | The block stays at Sat 09:00 and grows to 09:00-09:30. |
| thursday/35-step6-refit-preview.jpg | Re-fit late in the week: both blocks go to Mon 2 Nov (this week has no study time left). |
| thursday/36-step6-refit-moved.jpg | "Moved 2 blocks. They're in your calendar.", but they are in next week, which the calendar isn't showing (N4). |

## Findings

| # | Status / severity | Step | What | Screenshots |
|---|---|---|---|---|
| F1 | Fixed | 4 | The ripple is visible: the board follows the card to the Calendar block, the chip and To-do row are on screen, the card starts from the visible part of the moment. | light/21-23 |
| F2 | Fixed | 5 | The block now grows with its length (9px -> 15px tall); see N3 for how small that is. | light/31 |
| F3 | Fixed | 2 | The panel floats over past days mid-week and over the weekend early in the week, never over a draft. | thursday/06, light/09 |
| F4 | Fixed | 4 | Show summary opens all three lines. | light/18 |
| F5 | Fixed | 6 | Re-fit keeps the 2h a day budget (spreads over days, goes to next week when this one is full). | light/35, thursday/35 |
| F6 | Fixed | 6 | The Calendar re-fit banner steps aside while To-do shows the preview. | light/35 |
| F7 | Fixed | 1-6 | Toasts sit in a fixed strip under the board and no longer cover widgets. | light/05, light/23 |
| F8 | Fixed | 3 | Showing is at the top of the board menu. | light/04, light/13 |
| F9 | Fixed | 4, 6 | After See it and re-fit the grid stays on the day hours (08:00 at the top). | light/25, light/36 |
| F10 | Fixed | 4 | The See it card no longer overlaps the popover. ("1:18" still wraps: N5.) | light/26 |
| F11 | Fixed | 6 | Opening a seeded weak topic says so in a toast with "Back to Mitochondrial DNA - today". | light/33 |
| F12 | Deferred (U7) | 5-6 | Weakest Topics still on pre-U1 styling (uppercase "6 TO REVIEW", monospace "20% sure"). | light/32, dark/32 |
| F13 | Fixed | 2 | Leftover copy is right in number: "The other 2h is on days with too little study time left for them." | light/09 |
| F14 | Fixed | 1 | The today line drops classes that have ended. | light/01, thursday/01 |
| N1 | New, Low | 1-3 | After the three widgets are added the board is left scrolled about 60px, so the Calendar and To-do headers (titles, expand/close) are under the top bar until you scroll up. Likely the scroll-to-new-widget plus the reserved toast strip. | light/05, light/06, light/14 |
| N2 | New, Low | 2 | Early in the week the panel over Sat-Sun is narrow (~235px): "Plan your time" wraps, after Shrink the capacity line has scrolled out of view, only two draft rows show and Accept draft / Keep my plan stack. Mid-week (over Mon-Wed) it is fine. | light/06, light/09 |
| N3 | New, Low | 4-5 | A 20-min review is a 9px sliver at the default hour height (15px at 30 min): its title is unreadable; only the glow and the card identify it. | light/23, light/31 |
| N4 | New, Low | 6 | Late in the week re-fit moves blocks into next week but says "They're in your calendar" while the calendar shows this week; nothing tells you to look ahead. | thursday/35-36 |
| N5 | Nit | 4 | Popover source line still wraps: "From Mitochondrial DNA - / today · 1:18". | light/26 |

Not fixed here (product code is out of scope for this PR); listed for dispatch.
