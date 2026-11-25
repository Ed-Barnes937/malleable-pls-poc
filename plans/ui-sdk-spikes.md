# UI SDK spikes (K0)

**Date:** 2026-11-25. **Version:** `@ui-sdk/core` / `@ui-sdk/react` `0.1.0-beta.16`. **Plan:** `plans/ui-sdk-adoption.md`.

Three throwaway spikes, each on its own branch with a draft "DO NOT MERGE" PR against `ui-sdk`:
- Spike 1, popover press-through: `uisdk/k0-spike-popover`, #149
- Spike 2, calendar on `createSpans`: `uisdk/k0-spike-calendar`, #147
- Spike 3, panels on `createMove` / `createResize`: `uisdk/k0-spike-panels`, #148

## Verdicts

| Spike | Question | Verdict |
|---|---|---|
| 1 | Press outside closes the popover and reaches the block | WORKAROUND: works for mouse and pen, not touch. Keep `closing-press.ts` and the capture `pointerdown` handler in K3; cancel UI SDK's `outside-press`, `focus-out`, `window-blur`; UI SDK handles Escape |
| 1 | Placement parity | GO with differences: collision is against the viewport only, so a popover can spill past the calendar panel |
| 1 | Escape and focus return | WORKAROUND: keep the Popover mounted with `open=false` while closing and set `finalFocus` |
| 2 | Move, resize, draw by pointer and keyboard | GO; K4 needs a latest-wins save queue per block (fast key presses saved out of order) |
| 2 | Block across midnight | WORKAROUND: one span per day piece; spans are clamped to their day, so a block can't be dragged past midnight |
| 2 | Commitments as `disabled` | GO |
| 2 | Native drop from Help me plan | GO |
| 2 | Phone scroll vs drag | WORKAROUND (Chromium proven, WebKit needs a real iPhone): `bindHold` 400 ms + `pan-y` tracks. Today's grid already blocks scrolling except in the hour gutter |
| 2 | `stackSpans` lanes vs today | GO: identical over 500 random weeks |
| 3 | Pointer and keyboard move/resize, snap, bounds | GO with workarounds: drag preview isn't bounded or snapped until release; Shift on a corner also locks aspect ratio (no opt-out) |
| 3 | Narrow stacked layout, fullscreen, z-order, drawer drop | GO |
| 3 | `onLayoutChange` once per commit | GO, better than today (a resize drag saved 16 times today, once now; Escape saves nothing) |

No answer is a no-go. The per-spike findings follow.


## Spike 1 - Popover press-through (K0)

Branch `uisdk/k0-spike-popover` (throwaway). `EventPopover` / `StudyBlockPopover` sit inside UI SDK `Popover` (`0.1.0-beta.16`, controlled `open`, virtual `anchor`). Modes:
- `native`: today's code.
- `sdk`: UI SDK owns dismissal.
- `sdk-marks`: UI SDK dismisses, and its `outside-press` event goes through `closing-press.ts`.
- `sdk-capture`: today's capture handler and `closing-press.ts` kept on top of the UI SDK Popover.

### 1. Close and reach the block in one press? Does `closing-press.ts` survive?

**Desktop yes, touch no. WORKAROUND: keep `closing-press.ts` and CalendarLens's capture `pointerdown` handler. In `onOpenChange`, cancel `outside-press`, `focus-out` and `window-blur`, and let UI SDK handle Escape.**

- Mouse and pen: UI SDK dismisses on a window capture `pointerdown`, and the press goes on to reach the block.
- Touch: UI SDK dismisses on the tap's `click` (`core/dist/foundation/platform/layers.js`). Our #103 `touchend` `preventDefault` cancels that click, and a touch drag never produces one. Result: in Chromium and WebKit, no touch press made UI SDK dismiss.
- UI SDK alone has no toggle, no close-only, and no "outside the calendar keeps it open".

Existing `calendar.e2e.ts` + `phone.e2e.ts` (25 tests): native 25, `sdk` 21, `sdk-marks` 25 (needs focus-out cancelled and `finalFocus`), `sdk-capture` 25. Failures under `sdk`:
- the toggle (`calendar.e2e.ts:290`)
- mid-save close-only (`:349`, a second update was sent)
- the due-marker toggle (`:372`)
- the automation editor (`:515`, focus-out closed it)

The drag-through part of #100 passed. With `--repeat-each=4`, the #100/#103 cases passed 44/44 in both `sdk-capture` and `sdk-marks`.

Phone, popover open (`e2e/spike-popover.e2e.ts`; Chromium and WebKit agree; touch drag in Chromium only):

| | sdk / sdk-marks | sdk-capture |
|---|---|---|
| Tap the open block | reopens | closes |
| Tap empty time | opens "Add to calendar" | only closes |
| Touch-drag another block | moves; old popover stays open | moves and closes |

I couldn't measure `native` on a phone: today's popover covers the whole visible grid.

### 2. Placement parity

**GO, with differences.**
- Desktop: `side="right" align="start" sideOffset=12 alignOffset=-24 collisionPadding=8` on a point anchor. It sits beside the press. Its top is 26px above the press (today 99px, because today's popover is clamped to the panel).
- Phone (or wherever "beside" would cover the press): `side="top"` on an anchor spanning the block, flipping to bottom.

**API gap:** collision only works against the viewport. There is no boundary option, so the popover can spill past the calendar panel. On a phone it now sits above the block (today it covers it), but it covers the panel header.

### 3. Escape and focus return

**WORKAROUND.** Escape works. Focus return failed until:
- the Popover stays mounted with `open=false` while it closes, and
- `finalFocus={() => opener}` is set (a Popover rendered open with no trigger has nothing to return focus to).

Opening through `controller.open({ anchor })` might return focus without `finalFocus`. That's untested. VoiceOver needs a human.

### Changes for K1-K5

- **Top layer:** in every SDK mode, the popover rendered above a `fixed z-50` overlay (a shared-ui `Dialog` stand-in). This matters for the Automation dialog, which opens from the popover. K3 needs dialogs moved to the top layer first (K1/K2), or `inline` (untested).
- **Focus-out:** a non-modal Popover closes on `focus-out`. Cancel it.
- **K3:** keep `closing-press.ts`. Still replace `popover-position.ts` and `useEscapeToClose`.

### Evidence

Screenshots and results JSON are in `/private/tmp/claude-501/-Users-edward-barnes-glean-co-Code-Worktrees-malleable-plc-poc-ui-sdk/936cf541-3eaf-4443-b7a9-2838f29d8bd3/scratchpad/spike/`, for example `desktop-sdk-capture-placement.png`, `phone-native-placement-Alpha.png`, `layers-*.png` and `results-*.json`. The e2e logs are `e2e-<mode>.txt` one level up.

One "quick second tap" failure appeared once, in a superseded `sdk` variant that unmounted the popover on close. With the final code it passed 8/8.

## K0 spike 2 - Calendar grid on `createSpans`

Branch `uisdk/k0-spike-calendar` (8b6b336, draft PR, never merged), `@ui-sdk/core` 0.1.0-beta.16. One track per day, minutes 0-1440, `step` 15, `minSize` 15, `size` 60. Evidence: session scratchpad `k0s2/`.

**Overall: GO for K4, with the workarounds below.**

### 1. Move, resize, draw (pointer and keyboard) - GO
- Pointer move, edge resize, draw, click-to-open and Escape-to-cancel all work, checked against the server. Arrows move 15 min, Left/Right change day, Shift+arrows resize, Enter opens. Focus stays on the block after a day change. The announcement uses our `label`.
- **Bug to fix in K4:** each key press saves at once. 8 quick presses sent 8 saves in order, but the server kept the **first**; with 50 ms or more between presses it was right. K4 needs a "latest wins" save queue per item in `handleMove`.
- Gaps: Shift+arrows move only the end. Delete removes with no confirm (catch it before `keydown`). A tap on empty time snaps to 15 min, where today it snaps to the half hour.
- `createSpans` needs only `{ store, onDestroy }`: a tiny store with `useSyncExternalStore` was enough.

### 2. Block across midnight - WORKAROUND
Each day's piece is its own span (`occurrence:day`); the save rebuilds the whole block.
- Moving either piece moves the whole block (23:00-01:00 became 23:15-01:15).
- Every span is clamped to its day, so **no block can be dragged past midnight** (one dragged to 23:30 stopped at 23:00-00:00). Today it can.
- Resizing the first piece's midnight end shortens the block to that day and drops the rest. Fix: give a piece that runs into the next day no resize edge.

### 3. Commitments as `disabled` - GO
Pointer and keys leave them unchanged. They keep their lane and still open on click.

### 4. Native drop from Help me plan - GO
Drag source unchanged; the grid's drop handlers sit on the wrapper, spans on the day columns. A dropped to-do was scheduled at the drop point (`q4-after-drop.png`).

### 5. Touch scrolling - WORKAROUND (Chromium proven, WebKit not)
- **Today's grid already has `touch-action: none`.** In phone emulation (Pixel 7, real touch through Chrome DevTools), `ui-sdk` as it stands: a swipe on a day doesn't scroll, a swipe on a block moves it, and only the 48 px hour gutter scrolls. `createSpans` with `none` is the same, except that a swipe on empty time now draws a block.
- Workaround: `bindHold` (400 ms), tracks `pan-y`, and a non-passive `touchmove` that stops scrolling once a press is held. Results: swipes on empty time and on blocks scroll, a long-press then slide moves the block (no scroll), and a long-press on empty time draws.
- **WebKit:** Playwright can't swipe-scroll in WebKit. **Ed needs to check on a real iPhone** (spike branch, `localStorage['spike-touch']='hold'`).

### 6. `stackSpans` vs today's lanes - GO
The vitest `spike-lanes.test.ts` compares 500 random weeks (over 5,000 pieces): identical once spans are in key order (ties go by input order). In the seeded week, all 15 blocks sit within 1 px of today (`q6-base.png`, `q6-spike.png`). Use `stackSpans` with our own pixel styling; `spanStyle` can't do our minimum heights or gutters.

### Changes to K3/K4
- K4: the save queue, the midnight rules, and the Delete confirm.
- K3/K4: keep the closing-press toggle and the phone tap fix. The spike dropped them; they are the only 2 of 30 failures in the `calendar`, `help-me-plan` and `phone` e2e suites (calendar.e2e:245, phone.e2e:246).
- K4 phone: `bindHold` + `pan-y`, after Ed's iPhone check.
- **Question for Ed:** should a dragged block still be able to cross midnight?

## Spike 3 - Board panels on createMove + createResize

Branch `uisdk/k0-spike-panels` (throwaway), `0.1.0-beta.16`. A `board` primitive (`spike-board.ts`) holds the panel boxes; `CanvasEngine.tsx` renders canvas, panels and 8 handle buttons through `usePrimitive`/`usePart`; each commit writes `canvas-store` once. Evidence: Playwright at 1440x900, 400px and iPhone 13 (Chromium, WebKit), also run on today's code as a baseline; 15 of 16 pass (the 16th is a log-only scroll check, spike 2's question). Spec on the branch (`spike/`); log and screenshots in the session scratchpad `panels/`.

### Verdicts

**Q1 Pointer and keyboard move/resize - GO, with workarounds.**
- Move lands exactly (+103,+57); Shift snaps to 20px (140,100); `bounds` takes today's `clampToCanvas` rule (x 1340 / -360, y 0). Resize se/nw keeps the opposite corner fixed and clamps at the widget minimum (300x250).
- The move **preview is unbounded and unsnapped** (a panel can leave the screen mid-drag, `shots/spike-move-out-of-bounds-mid.png`); it snaps on release. Workaround: clamp the draft offset in our own panel `live` binding instead of `move.style`.
- **Shift on a resize corner also locks the aspect ratio**, with no opt-out (`aspect` returning `undefined` falls back to Shift). Shift+drag (+97,+13) gave 560x500; today 560x440. API gap.
- `step` is both the drop grid and the keyboard distance: with step 1 (Shift for 20), Alt+arrow moves 1px and Alt+Shift+arrow 20px.
- Default keys: Alt+arrows move, plain arrows on a focused handle resize (edge handles on their own axis only), Shift for larger, Escape cancels a pointer drag (captured, so the canvas Escape doesn't also clear the selection). No clash with `useCanvasKeyboard` (asserted). Outside it, Alt+Left/Right is Back/Forward on Windows/Linux and word-jump in macOS fields: the spike skips fields (asserted) and prevents the default when it acts.
- 8 focusable handles per panel = 8 tab stops per widget.

**Q2 Narrow stacked layout - GO.** `disabled: () => narrow`, no handles rendered. At 400px and on both phones: no movement, 0 persists.

**Q3 Fullscreen - GO.** `disabled(key)` for the fullscreen panel; drag and Alt+arrow do nothing, 0 persists, no handles.

**Q4 Z-order - GO.** Our `onPointerDown` still runs `bringToFront` (z 0 -> 2). Pre-existing bug: seeded panels all have `z_index` 0 and `bringToFront` skips a panel at max, so on a fresh board pressing raises nothing.

**Q5 Persistence - GO, better than today.** One `onLayoutChange` per drag (today one resize drag persisted **16 times**), 4 for 4 key commits, 0 on Escape. Held Alt+arrow persists per key repeat; consider a debounce.

**Q6 Drawer -> board drop - GO.** The behaviours add no canvas listeners; dragover is accepted and the drop adds the widget (4 -> 5), via synthetic DragEvents through the real handlers (Playwright's native drag fires on neither branch).

### Surprises affecting K1-K5
- `useHandle` isn't exported from `@ui-sdk/react/primitive`; pass the handle down. `usePart` props reject `data-*` keys in an object literal (TS); spread a cast object.
- Unit tests: 2 of 198 fail (`style.left` is now `var(--resize-x, 10px)`; no handles in fullscreen). K5 must change those assertions.
- Turn transitions off while `dragging` (slot state).
- K5: `clampToCanvas` survives as `bounds`; `resizeDimensions`/`anchoredPosition` go.
- Pre-existing on both branches: after a resize that ends outside the panel, the next handle press misses until re-hover (hover-gated pointer events). Baseline Shift-move didn't snap (143,97).

### Questions for Ed
1. Snapping: keep Shift-to-snap (1px keyboard nudges; Shift-corner also locks the aspect ratio) or always snap to 20px (Alt+arrow 20px; Shift = aspect lock, as in design tools)?
2. Handle tab stops: all 8 per panel, only the selected panel's, or one?
3. Clamp the drag preview (workaround above) or accept snap-back on release?
