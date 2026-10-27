# Demo runbook

The student planning demo (`plans/student-planning-demo.md` section 2), as the app behaves today. Best on a **Monday to Wednesday daytime** (07:00-20:00 London): the reseed sizes the week around "now" so step 2 reads the same at any of those times. **Reseed within an hour before demoing.** A rehearsal of exactly these steps runs as `e2e/journey-demo.e2e.ts` (mock AI).

## Setup (before the demo)

1. `apps/server/.env` holds `AI_MODE=live`, `OPENROUTER_API_KEY` and, optionally, `OPENROUTER_LLM_MODEL` (default in `apps/server/src/ai/openrouter.ts`). Only `pnpm dev:server` loads it.
2. Database: `pnpm dev:db`, then `pnpm dev:migrate` (applies any new migrations).
3. Live smoke test (Ed only, costs a few cents): `AI_MODE=live pnpm demo:live-smoke`. Check the transcript and every LLM task print sensibly.
4. `pnpm dev:server`: the startup line must read `AI_MODE=live - transcriber=..., llm=...`. Then `pnpm dev:web` and open http://localhost:5173 at 1440x900 or larger.
5. Within an hour before the demo: `pnpm db:reseed` (restores Priya's week around now, `e2e/seed-week.ts`), then **reload the browser tab**.
6. Have `demo/lecture-mitochondrial-dna.wav` ready in a Finder window.

What the reseed gives you: weekly Biology lectures (Mon, Wed 10-12), Chemistry (Tue 14-16), cafe shifts (Tue, Thu 17-22); Biology quiz Thu 10:00, Chemistry lab report Fri 17:00; six to-dos to plan (12h, only the 3h lab report write-up is longer than a day); two Biology study blocks from yesterday that didn't happen; some study already planned later in the week (Sat, Sun, maybe Fri), sized so the week has 9 hours of study time left; the existing study boards and lectures. No planning board: you build it.

## The script

**1. Build a board live**
- Click **+** (New board) in the top bar, name it "My week", **Create**.
- Open the board menu (top-left), click **Calendar**, **To-do**, **Coming up** (the drawer stays open), then Escape.
- Calendar shows the week with lectures and both shifts as fixed blocks, the planned weekend study, and yesterday's two blocks. Coming up: Biology quiz (Thu), Chemistry lab report (Fri). To-do (and the Calendar) already ask "2 blocks didn't happen. Re-fit them?": **leave it for step 6, don't click Not now** (if you do, reload the tab to bring it back).

**2. Plan the week**
- In the Calendar, **Help me plan**. The panel reads "About 9 hours of study time left this week. Your to-dos need 12." (2h of study a day).
- Assign one by hand: on "Revise for the Biology quiz", click its first suggested time (e.g. "Today 10:30"). Copy updates to 7 hours / 10.
- **Auto-fill**. Ghost blocks appear; the note says what is due soonest; "Shrink 'Lab report write-up' to 2h? (now 3h)". Click **Shrink to 2h**: "Drafted ... of study time. ... didn't fit." (the to-dos that don't fit are listed honestly).
- **Accept all**. Close the panel (x), then drag any accepted study block to a new time (e.g. to Saturday afternoon).

**3. Scope**
- Board menu > Showing > Course: **Biology**, then Escape. Chip "Showing: Biology"; the calendar says "Biology highlighted" (Chemistry dimmed, shifts kept); Coming up shows the quiz and "+1 in other courses".

**4. Lecture**
- Board menu: click **Audio Capture** and **Transcript**, Escape. On a full board they land below the other widgets (nothing is covered) and the board scrolls down to show them. **Upload first, then arrange**: dragging the Transcript about before uploading can hide Audio Capture's upload arrow.
- In Audio Capture, click the **upload arrow next to the mic**, pick the demo wav, title it **"Mitochondrial DNA - today"** (distinct from the seeded "Biology Lecture: Mitochondrial DNA"), course is pre-set to Biology, **Upload**. The Transcript says "Transcribing your lecture...", then "Writing your summary...", and the transcript and a 3-line summary appear in a few seconds.
- Remove Audio Capture (its x). If you like, drag the Transcript into the right-hand column (under To-do / Coming up) so the calendar and transcript are both in view; otherwise the board scrolls down to the Transcript whenever a moment opens in it.
- In the Transcript, click the moment starting "Now, here is the part people find tricky, so let me try to explain maternal inheritance" (1:18 in mock mode), then **confused**. Chip: "Review planned ... · 20 min"; To-do gets "Review: maternal inheritance", "from: Mitochondrial DNA - today, 1:18".
- The review lands as late as possible within 3 days, around everything accepted: marked on a Tuesday that is **Friday 21:30-21:50**, at the bottom of the grid (with the re-fit banner showing, scroll the calendar down to see the evening). Click it: the popover says "Showing this moment in the Transcript." and the transcript jumps there (the board scrolls to the Transcript if it is below the fold). Press Escape.

**5. Malleability**
- Transcript widget's automations button (lightning): "When I mark something confusing, add a 20-min review within 3 days". Change **20** to **30** and **within 3 days** to **by tomorrow**: "Saved. Moved 1 review to fit." Close the dialog: the block moves to tomorrow evening (on a Tuesday, **Wednesday 21:30-22:00**), chip "· 30 min".
- Add a widget with a click: board menu > **Weakest Topics**; it lands in free space (below the others on a full board) and the board scrolls to it. Remove any widget with its x.

**6. Encores**
- Weakest Topics lists readable topics: Maternal inheritance (today's lecture, "Confusing"), Mitochondrial disease, Maternal inheritance (the seeded lecture), Paternal inheritance, ... Click one: the Transcript jumps to that moment (seeded ones show "Reviewed · 20 min").
- To-do: "2 blocks didn't happen. Re-fit them?" > **Re-fit** (preview of new times) > **Move them**: "Moved 2 blocks. They're in your calendar." (If the demo runs long, study blocks you accepted earlier today may have passed too and join the count.)

## Fallbacks

- **Live transcription fails:** stop the server, run `AI_MODE=mock pnpm dev:server` (the command line wins over `.env`) and upload the demo wav again: mock mode recognises it by hash and returns the real script with real timings. Summary and review titles then come from the mock LLM (still "Review: maternal inheritance").
- **LLM fails** (summary, review title, Auto-fill): same switch to `AI_MODE=mock`. Placement never uses the LLM, so blocks land the same.
- Something odd on the board: `pnpm db:reseed`, reload the browser tab and rebuild the board (about a minute).

## Known hazards

- **Day and time.** Monday to Wednesday 07:00-20:00 give "About 9 hours"; from Thursday there is less than 9 hours left at 2h a day, so it honestly says less (still over capacity, same trim). Today's free time also shrinks as the day goes on, so reseed within an hour before the demo.
- **Clicking a deadline in Coming up re-scopes the whole board** to its course. Put it back in the board menu > Showing.
- The confusion review uses "as late as possible": "within 3 days" lands ~3 days out, "30 min by tomorrow" moves it to tomorrow evening, not "Wednesday around the Thursday shift" as the plan imagined.
- **Live Whisper splits moments differently** from mock: in mock the maternal-inheritance moment is one 40s segment (1:18-1:59); live it may be two or three shorter ones. Tap the one with "explain maternal inheritance"; the review title comes from the live LLM.
- Weakest Topics shows two "Maternal inheritance" rows (the seeded lecture and today's); the distinct upload title tells them apart.
- After the automation edit, a block popover left open still shows the old times until reopened: close popovers (Escape) first.
- Keep Test Me off the demo board (its answer field is cut off); the seeded Evening Review and Exam Prep boards have it, so stay on "My week".
