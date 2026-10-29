# Demo runbook

The student planning demo (`plans/student-planning-demo.md` section 2), as the app behaves today. Best on a **Monday to Wednesday daytime** (07:00-20:00 London): the reseed sizes the week around "now" so step 2 reads the same at any of those times. **Reseed within an hour before demoing.** A rehearsal of exactly these steps runs as `e2e/journey-demo.e2e.ts` (mock AI); the latest dress rehearsal, with screenshots of every beat in light and dark, is `plans/student-planning-demo-artifacts/storyboard-ux-polish/`.

## Setup (before the demo)

1. `apps/server/.env` holds `AI_MODE=live`, `OPENROUTER_API_KEY` and, optionally, `OPENROUTER_LLM_MODEL` (default in `apps/server/src/ai/openrouter.ts`). Only `pnpm dev:server` loads it.
2. Database: `pnpm dev:db`, then `pnpm dev:migrate` (applies any new migrations).
3. Live smoke test (Ed only, costs a few cents): `AI_MODE=live pnpm demo:live-smoke`. Check the transcript and every LLM task print sensibly.
4. `pnpm dev:server`: the startup line must read `AI_MODE=live - transcriber=..., llm=...`. Then `pnpm dev:web` and open http://localhost:5173 at 1440x900 or larger. Light is the default theme; the sun/moon button in the top bar switches to dark (remembered by the browser).
5. Within an hour before the demo: `pnpm db:reseed` (restores Priya's week around now, `e2e/seed-week.ts`), then **reload the browser tab**.
6. Have `demo/lecture-mitochondrial-dna.wav` ready in a Finder window.

What the reseed gives you: weekly Biology lectures (Mon, Wed 10-12), Chemistry (Tue 14-16), cafe shifts (Tue, Thu 17-22); Biology quiz Thu 10:00, Chemistry lab report Fri 17:00; six to-dos to plan (12h, only the 3h lab report write-up is longer than a day); two Biology study blocks from yesterday that didn't happen; some study already planned later in the week (Saturday first, then Sunday and Friday earlier in the week), sized so the week has 9 hours of study time left; the existing study boards and lectures. No planning board: you build it.

The times below are from a rehearsal on **Tuesday at 10:30** (the e2e rehearsal's default); on another day or time the slots differ, the copy doesn't. The storyboard also has a real-clock Thursday run.

## The script

**1. Build a board live**
- The top bar shows today at a glance: "Tuesday · Chemistry 14:00 · shift 17:00-22:00 · 2h to study" (classes that have ended drop off).
- Click **+** (New board) in the top bar, name it "My week", **Create board**. The empty board offers three starters ("Plan my time" would add the next three widgets in one click); use the board menu instead.
- Open the board menu (top-left), click **Calendar**, **To-do**, **Coming up** (the menu stays open), then Escape. The board is left scrolled a little, with the Calendar's header under the top bar: scroll up to show it.
- Calendar shows the week with lectures and both shifts as fixed blocks, the planned weekend study, and yesterday's two blocks. Coming up: Biology quiz (Thu), Chemistry lab report (Fri). To-do (and the Calendar) already ask "2 blocks didn't happen. Re-fit them?": **leave it for step 6, don't click Not now** (if you do, reload the tab to bring it back).

**2. Plan the week**
- In the Calendar, **Help me plan**. The panel ("Plan your time") floats over days already past mid-week (e.g. Mon-Wed on a Thursday), or over the weekend on a Monday or Tuesday, never over a draft. It reads "About 9 hours of study time left this week (2h a day). Your to-dos need 12."; the bar hatches the 3h short. Free gaps on the grid show their length (e.g. "3h 20m free").
- Assign one by hand: on "Revise for the Biology quiz", click its first suggested time (the next free quarter hour, e.g. "Today 10:45" just after 10:30). Copy updates to 7 hours / 10.
- **Auto-fill**. Ghost blocks appear; the note says what is due soonest; "Lab report write-up (3h) is too long for one day." Click **Shrink to 2h**: "Drafted 5h of study time. 4h didn't fit. The other 2h is on days with too little study time left for them." (or free time in gaps too short), and the draft names each to-do that didn't fit with **Pick a time**. On a Tuesday the draft is Lab report write-up Wed 12:15, Make flashcards Thu 09:00, Chemistry past paper Fri 09:00.
- Early in the week the panel over the weekend is narrow: after Shrink, scroll it to see the capacity line and the whole draft, or click **»** ("Hide the plan to see the calendar") to show every ghost ("3 suggested blocks ... Accept all / Keep my plan") and **Show plan** to bring the panel back.
- **Accept draft**. Close the panel (x), then drag the **earliest block Auto-fill placed, other than the Lab report write-up**, to Saturday afternoon (e.g. Saturday 15:00): on a Tuesday that is Thursday's "Make flashcards". Step 4's review lands where it was.

**3. Scope**
- Board menu > **Showing** (at the top of the menu) > Course: **Biology**, then Escape. Chip "Showing: Biology"; the calendar says "Biology highlighted" (Chemistry dimmed, shifts kept); Coming up shows the quiz and "+1 in other courses"; To-do "+4 in other courses".

**4. Lecture**
- Board menu: click **Audio Capture** and **Transcript**, Escape. On a full board they land below the other widgets (nothing is covered) and the board scrolls down to show them. **Upload first, then arrange**: dragging the Transcript about before uploading can hide Audio Capture's upload arrow.
- In Audio Capture, click the **upload arrow next to the mic**, pick the demo wav, title it **"Mitochondrial DNA - today"** (distinct from the seeded "Biology Lecture: Mitochondrial DNA"), course is pre-set to Biology, **Upload**. The Transcript says "Transcribing your lecture...", then "Writing your summary...", and the transcript appears with a one-line summary at its top in about 3 seconds (mock). **Show summary** opens all three lines; the moments follow them and scroll. The lecture joins the chip: "Showing: Biology · Mitochondrial DNA - today".
- Remove Audio Capture (its x). Leave the Transcript where it is, under the calendar: the board scrolls between them by itself.
- In the Transcript, scroll to the moment starting "Now, here is the part people find tricky, so let me try to explain maternal inheritance" (1:18 in mock mode), click it, then **confused**. The ripple, about a second later: the moment gets an amber chip at its end (e.g. "Review planned · Thu 29 Oct 09:00 · 20 min"), a "Review: maternal inheritance" card lifts off the moment and the board glides up with it to the review's Calendar block, which glows in Biology green as the card lands, with a card under it saying where it came from; the To-do row slides in ("From Mitochondrial DNA - today · 1:18"), and the toast strip under the board says "Review added to your plan · **See it**". Don't scroll while it runs: if you do, the board stays where you put it. (With Reduce motion on, the board jumps to the block and nothing flies or slides.)
- The review goes in the **earliest free time** within 3 days: at least an hour after you mark it, from 09:00, around classes, shifts and every block you accepted, with the same 10-minute gap Help me plan keeps, preferring a day with study time left (reviews count against the 2h a day; only if every day in the window is full does it go over). After step 2 today and tomorrow are full, so it lands at **09:00 where the block you dragged to Saturday used to be**: Thursday 09:00 when marked on a Tuesday (Saturday 09:00 on a Thursday). A 20-minute block is a thin sliver on the grid; the glow and its card are what to point at. Click **See it** (or the chip) to show it again. Click the block: the popover leads with where it came from ("From Mitochondrial DNA - today · 1:18" in mock mode), "You marked this confusing" and the quoted line, then **Go to moment**, Mark done and Edit time, and a footer naming the automation that made it ("Made by "When I mark something confusing, add a 20-min review within 3 days". Edit"). Click **Go to moment**: the popover says "Showing this moment in the Transcript.", the board stays on My week, scrolls down to the Transcript and the moment is outlined. Press Escape. (On a board with no Transcript, Go to moment opens it on a board whose Transcript is set up for reviewing, e.g. Evening Review, with a toast offering "Back to My week".)

**5. Malleability**
- Transcript widget's automations button (lightning): "Automations · Transcript", "When I mark something confusing, add a 20-min review within 3 days". Change **20** to **30**: "Saved. Your review is now 30 min." Close the dialog: the block stays where it is and gets a little longer (09:00-09:30), chip "· 30 min". If 30 minutes no longer fit there it moves to the next free time instead ("Saved. Moved 1 review to fit.").
- Add a widget with a click: board menu > **Weakest Topics**; it lands in free space (below the others on a full board) and the board scrolls to it. Remove any widget with its x.

**6. Encores**
- Weakest Topics lists readable topics: Maternal inheritance (today's lecture, "Confusing"), Mitochondrial disease, Maternal inheritance (the seeded lecture), Paternal inheritance, ... Click one: the Transcript jumps to that moment (seeded ones show "Reviewed · 20 min"). A seeded one is in the other lecture, so the board switches to it and a toast says so ("Opened 27:00 in Biology Lecture: Mitochondrial DNA") with **Back to Mitochondrial DNA - today**.
- To-do: "2 blocks didn't happen. Re-fit them?" > **Re-fit** ("Here is where they could go:" with new times within the 2h a day; the Calendar's own banner steps aside meanwhile) > **Move them**: "Moved 2 blocks. They're in your calendar." (If the demo runs long, study blocks you accepted earlier today may have passed too and join the count.)

## Fallbacks

- **Live transcription fails:** stop the server, run `AI_MODE=mock pnpm dev:server` (the command line wins over `.env`) and upload the demo wav again: mock mode recognises it by hash and returns the real script with real timings. Summary and review titles then come from the mock LLM (still "Review: maternal inheritance").
- **LLM fails** (summary, review title, Auto-fill): same switch to `AI_MODE=mock`. Placement never uses the LLM, so blocks land the same.
- Something odd on the board: `pnpm db:reseed`, reload the browser tab and rebuild the board (about a minute).

## Known hazards

- **Day and time.** Monday to Wednesday 07:00-20:00 give "About 9 hours"; from Thursday there is less than 9 hours left at 2h a day, so it honestly says less (still over capacity, same trim). Today's free time also shrinks as the day goes on, so reseed within an hour before the demo.
- **Clicking a deadline in Coming up re-scopes the whole board** to its course. Put it back in the board menu > Showing.
- The confusion review uses the earliest free time on a day with study time left (2h a day, counting the review). If every day in its window is already at 2h it still goes on the calendar, in the earliest free time (over the 2h); only a window with no free time at all leaves it on the to-do list ("Review on your to-do list"). Where it lands depends on what you accepted and dragged in step 2 and on the real clock (the server's): the 09:00 example assumes you dragged the earliest Auto-fill block (not the lab write-up) to Saturday, as the e2e rehearsal does.
- **Don't scroll during the ripple** (about two seconds after confused): the board stops following it.
- **Live Whisper splits moments differently** from mock: in mock the maternal-inheritance moment is one 40s segment (1:18-1:59); live it may be two or three shorter ones. Tap the one with "explain maternal inheritance"; the review title comes from the live LLM.
- Weakest Topics shows two "Maternal inheritance" rows (the seeded lecture and today's); the distinct upload title tells them apart.
- Re-fit keeps the 2h a day, so late in the week (Thursday on) the missed blocks can go into next week; the calendar stays on this week, so press the next-week arrow to show them.
- Keep Test Me off the demo board (its answer field is cut off); the seeded Evening Review and Exam Prep boards have it, so stay on "My week".
