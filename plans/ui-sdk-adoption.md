# UI SDK Adoption - Orchestration Plan

**Date:** 2026-11-25
**Status:** Done, merged to main 2026-11-27 (#166). What shipped, what changed from this plan and what is left: section 10.
**Owner:** Ed
**Goal:** Replace the app's hand-rolled interaction code (popups, focus traps, menus, toasts, calendar block drag, board panel drag) with UI SDK behaviours and components, so every direct-manipulation surface also works by keyboard, screen reader and touch, and we stop paying for interaction bugs like #100 and #103.

Inputs:
- UI SDK docs: https://ui-sdk.dev/docs (Vercel Labs, Apache-2.0, `0.1.0-beta.x`). Repo: https://github.com/vercel-labs/ui
- Bundled agent docs once installed: `node_modules/@ui-sdk/react/docs/llms.txt`, `node_modules/@ui-sdk/core/docs/core.md`, `docs/rendering.md`. Implementers read these before writing code.
- Audit that led here: this conversation (2026-11-24/25). Genio fit and library age are not factors (Ed: any Genio version is a rewrite).

## 1. Decisions taken

1. **Adopt UI SDK across the app**, surface by surface, behind a spike gate (K0) for the three things the docs don't settle.
2. **Behaviours are used directly; styled components are wrapped once.** `@ui-sdk/core` behaviours (`createSpans`, `createMove`, `createResize`, `createReorder`, `position`) are used inside the package that owns the surface. `@ui-sdk/react` components (Popover, Dialog, Menu, Toast, Checkbox...) are wrapped in `@pls/shared-ui` with our Tailwind tokens, so lenses import `@pls/shared-ui`, not `@ui-sdk/react`.
3. **Pin an exact version** and bump deliberately (read the changelog, run the full suite). The repo's package-age policy currently resolves `0.1.0-beta.16`.
4. **The agent bridge (`createAgent`) is out of scope.** If an assistant should change plans or boards, it gets tools over the tRPC/substrate API.

## 2. Decisions (Ed, 2026-11-25)

1. **Cross-component drags stay as they are; changing them is a future feature.** Two drags cross component boundaries: drawer widget -> board (`DrawerSidebar.tsx:115`, `WorkspaceShell.tsx:193`) and Help me plan to-do -> calendar grid (`HelpMePlan.tsx:696`, `TimeGrid.tsx:384`). They keep the browser's native drag and drop and their click paths (drawer `onAdd`, Help me plan "Add" form). No ticket in this plan changes them, beyond keeping the grid's native drop target working alongside `createSpans` in K4. Options for the future feature are in section 6.
2. **Integration branch `ui-sdk`.** Ticket branches come off `ui-sdk` and their PRs target it. The orchestrator never merges to `main`; Ed merges `ui-sdk` to `main`.
3. **Styled from our tokens only.** Don't import `@ui-sdk/core/web.css`. Style the parts with our Tailwind tokens through their data attributes and CSS variables.
4. **No new capabilities during the migration.** Pan and zoom, lasso selection, command palette, undo and the rest are recorded in section 6 to pick up once K1-K5 are merged.

### After the K0 spikes (Ed, 2026-11-25)
Results are in `plans/ui-sdk-spikes.md`. No answer was a no-go.
5. **Merging:** the orchestrator merges each ticket PR into `ui-sdk` once its review passes and the full suite is green.
6. **Midnight:** a dragged block can't cross midnight (`createSpans` clamps to the day). Accepted.
7. **Calendar popovers** are kept inside the viewport, not the calendar panel; spilling past the panel on desktop and covering the panel header on a phone is accepted while the pressed block stays visible.
8. **Panels always snap to 20px** (pointer and Alt+arrow); Shift on a resize corner locks the aspect ratio, as in design tools. Panels stay clamped and snapped during the drag, not only on release. Only the selected panel's resize handles are tab stops.
9. **K5 fixes the z-order bug** where seeded panels all have `z_index` 0, so pressing a panel on a fresh board raises nothing.
10. **Phone long-press drag** on the time grid is checked by Ed on a real iPhone before K4b.

## 3. Ground rules

Section 3 of `plans/student-planning-demo.md` applies (hygiene, no real AI in tests, per-ticket DB and ports, browser verification by implementer and reviewer, fresh-context reviewer). Plus:
- **Proportionate effort:** one review per PR, one fix round, no re-review loops.
- **Behaviour parity first.** Every ticket keeps the existing CT (`*.iwft.tsx`) and e2e suites green without loosening assertions. Selector changes from new markup are updated in the same PR, with the reason in the PR body.
- **Every new keyboard path gets a test.** CT for the component, e2e where the surface already has one (`calendar.e2e.ts`, `help-me-plan.e2e.ts`, `panels.e2e.ts`, `board-builder.e2e.ts`, `phone.e2e.ts`).
- **ARIA checks:** use `checkPattern` from `@ui-sdk/core/testing` in vitest for each wrapped component and each converted surface.
- **Browser verification** in light and dark, at 1440 and ~400 widths, with a keyboard-only pass and a screen-reader spot check (VoiceOver) of the announcements on any drag surface.
- **Delete what you replace.** A ticket that moves the last caller off a hand-rolled helper deletes the helper and its tests.

## 4. Tickets

```
K0 ── K1 ──┬── K2
           ├── K3 ── K4a ── K4b
           └── K5
```
K0 gates everything. K2, K3 and K5 run in parallel after K1. K4a follows K3 because both touch the calendar's press handling; K4b follows K4a and Ed's iPhone check.

### K0 - Foundation and spikes
- Install `@ui-sdk/core` and `@ui-sdk/react` (exact pin) in the packages that need them. Confirm a component renders in the Vite app, in vitest (jsdom stubs from the testing docs: `showPopover`, `hidePopover`, `getAnimations`, the `[popover]` style, in `vitest.setup.ts`) and in Playwright CT (`playwright-ct.config.ts`).
- Add the `checkPattern` helper to the shared test setup.
- Three throwaway spikes, each answering one question with a minimal repro, written up in `plans/ui-sdk-spikes.md` with go / no-go / workaround:
  1. **Popover press-through.** With a Popover open over the time grid, does a press outside both close it and reach the block underneath (start a drag, open that block)? Repro the #100 and #103 cases on desktop and phone emulation. This decides whether `closing-press.ts` survives in K3.
  2. **Calendar on `createSpans`.** One track per day, values in minutes, `step` 15, `minSize` 15, `stackSpans` for side-by-side lanes. Check: a block that crosses midnight (we render `continuesBefore`/`continuesAfter` segments), fixed commitments as `disabled`, the existing native drop from Help me plan still landing on the grid, and **touch: whether `touch-action: none` on tracks kills vertical scrolling of the grid on a phone** (if so, try `bindHold` so a long-press starts the drag).
  3. **Panels on `createMove` + `createResize`.** Wire one panel to `canvas-store.ts` with our snap grid as `step` and the canvas as `bounds`. Check the narrow stacked layout (move disabled), fullscreen, z-order on press, and that `onLayoutChange` persistence still fires once per commit.
- Exit: the spike write-up, and this plan revised if any answer is no-go.

### K1 - Shared-ui on UI SDK
Wrap and style in `packages/shared-ui`, replacing the hand-rolled versions:
- `Dialog` (replaces `Dialog.tsx` internals and `useFocusTrap.ts`), `AlertDialog` / confirm, `Popover`, `Menu`, `Drawer`, `Tooltip`.
- Dialogs render on the top layer above UI SDK popovers (spike 1: a UI SDK popover drew above today's `fixed z-50` dialogs, and `AutomationDialog` opens from the calendar popover footer). A CT proves a dialog opened from a popover stacks above it.
- `Toast`: keep our `toast()` call sites; the facade in `workspace-shell/src/toast.tsx` delegates to UI SDK Toast (timers that pause, priorities, F6).
- Form controls: `Checkbox`, `Switch`, `SegmentedControl`, `Tabs`, `TimeInput`, `DatePicker`. Keep `Select` native unless a surface needs more.
- `createColorScheme` behind `ThemeToggle` (adds "system", syncs across tabs; keep the `pls-theme` key or migrate it).
- Each wrapper: a `checkPattern` test plus a CT that renders it in both themes.
- Existing callers keep working (same props where reasonable). Moving surfaces onto the new pieces happens in K2-K5.

### K2 - Shell surfaces
- Board menu (`TopBar.tsx`), Activity drawer (`JobStatusIndicator.tsx`, including the stacked-over-board-menu case now handled by nested layers rather than the Escape special case at line 142), `LensAutomationsButton`, `BackgroundPicker`, `WorkspaceDialogs`, `AutomationDialog`, `DrawerSidebar` (UI SDK Drawer on phone).
- Board tab reorder in `WorkspaceSwitcher.tsx` on `createReorder` (horizontal), replacing the pointer handlers, with Space/Enter pick-up and arrow moves.
- Workflow step order in `WorkflowEditor.tsx` on `createReorder`; keep the up/down buttons.
- Delete `useFocusTrap` and `FocusTrapHarness` once unused.

### K3 - Calendar popovers and forms
- `EventPopover`, `StudyBlockPopover`, `StudyHoursEditor`, `RevealCallout` on the shared `Popover`, anchored to the pressed block (or a virtual anchor at the press point for new blocks). Match today's placement (beside the press, above or below the block on a phone) with `side`/`align`/`collisionPadding`; note anything lost.
- Replace `popover-position.ts` and `useEscapeToClose`. **Keep `closing-press.ts`** and CalendarLens's capture `pointerdown` handler on top of the new popover (spike 1: UI SDK closes on the click after a tap, which our #103 fix cancels, so touch never closed it). Cancel UI SDK's `outside-press`, `focus-out` and `window-blur` dismissals; UI SDK handles Escape.
- Focus return: keep the popover mounted with `open=false` while it closes and set `finalFocus` to the opener (or use `controller.open({ anchor })` if it proves to return focus by itself).
- Form: kind radio group -> `SegmentedControl`; date and times -> `DatePicker` and `TimeInput` (15-minute step); calendar view tabs -> `SegmentedControl`; `StudyHoursEditor` selects -> `TimeInput`.
- The #100 and #103 e2e cases must pass unchanged.

### K4a - Calendar grid on `createSpans` (desktop pointer and keyboard)
- Move, resize and draw blocks through `createSpans` in `TimeGrid.tsx`, replacing the pointer drag code and the lane/column maths (`stackSpans`, with our own pixel styling; spike 2 found lanes identical once spans are in key order). Persistence stays on our mutations, called from the commit, through a latest-wins save queue per block (spike 2: 8 quick key presses sent 8 saves and the server kept the first).
- New for keyboard users on committed blocks: arrows move (Up/Down in time, Left/Right across days), Shift+arrows resize, Delete asks the same "Delete it?" / "Delete every week?" confirm as the block popover (`EventPopover.tsx:207`; catch Delete before `createSpans` deletes), Escape cancels. Commitments stay fixed (`disabled`).
- A tap on empty time keeps today's half-hour snap.
- AI suggestions (proposals) use the same spans; keep Enter accepts and Delete dismisses, and drop the hand-rolled nudge handler.
- Announcements use our copy via `message` (e.g. "Maths study moved to Tuesday 14:00 to 15:00").
- Help me plan drop-in stays native (decision 2.1); the grid's `onDragOver`/`onDrop` keep working next to the spans.
- Keep the closing-press toggle and phone tap fix (`calendar.e2e.ts:245`, `phone.e2e.ts:246`).
- Today's touch behaviour is kept as is (`touch-action: none`); K4b changes it.

### K4b - Calendar grid: phone and midnight
- Phone: `bindHold` (400 ms) starts a drag or draw; tracks get `touch-action: pan-y`, plus a non-passive `touchmove` that stops scrolling once a press is held, so swipes scroll the grid. Starts after Ed's iPhone check of spike 2.
- Midnight (decision 6): each day's piece of a block is its own span and moving either piece moves the whole block; a piece that runs into the next day has no resize edge at its midnight end.

### K5 - Board panels on `createMove` / `createResize`
- Header drag and the 8 resize handles in `CanvasEngine.tsx` / `PanelChrome.tsx` on the behaviours, replacing the pointer code, `snap.ts` and the resize maths in `geometry.ts` (keep `anchoredPosition` and placement helpers that aren't drag-related).
- New for keyboard users: Alt+arrow moves the selected panel, resize handles are focusable buttons with arrow keys (only the selected panel's handles are tab stops), Escape puts a drag back. Alt+arrow is ignored in text fields. Extend `useCanvasKeyboard.ts` shortcuts only where they don't clash (spike 3 found no clash).
- Snap to 20px always (`step` 20); Shift on a resize corner locks the aspect ratio (decision 8). Clamp and snap the panel during the drag in our own `live` binding, not only on release. Turn transitions off while dragging. Debounce persistence for held Alt+arrow key repeat.
- Fix seeded panels all having `z_index` 0, so pressing a panel on a fresh board brings it to front (decision 9).
- Two `panel-system` unit assertions change with the new markup (`style.left` becomes a CSS variable; fullscreen has no handles); keep what they check.
- Narrow stacked layout and fullscreen: moving and resizing disabled, as today.

### Wrap-up
When K5 merges: run the full suite on `ui-sdk`, do one keyboard-only and VoiceOver walkthrough of the demo journeys, list any hand-rolled interaction code still left (with why), and hand `ui-sdk` to Ed to merge.

## 5. Surfaces not changing
- `TranscriptLens`, `WeakestTopicsLens`, `ConnectionsLens` keyboard handlers are simple Enter handlers; leave them unless a ticket touches them.
- Native `<select>` stays where it works.
- The two cross-component drags (decision 2.1).

## 6. After the migration: possibilities to pick up
Not in scope now (decision 2.4). Each would be a separate small PR once K1-K5 are merged, and each builds on pieces the migration puts in place. Ed picks which, if any.

| Possibility | UI SDK piece | What it gives students | Builds on |
|---|---|---|---|
| Board pan and zoom | `createViewport` (pan, pinch and Ctrl/Cmd+scroll zoom, `+`/`-`/`0` keys, `fit`, `reveal`) | Boards bigger than the screen; zoom out to see the whole board, reveal a panel by name | K5 (`createMove`/`createResize` take a `scale` option for zoomed canvases) |
| Select several panels | `createLasso` and the `group` option on `createMove` | Drag a box round panels, move or delete them together | K5 |
| Command palette | `Command` component | One shortcut to add a widget, switch board, open Help me plan, jump to a lecture | K1 popup layers |
| Undo | `createUndoStack` with a toast action | Undo for deleting a panel or block, moving a block, accepting a suggestion | K1 Toast, K4, K5 |
| Live transcript follow | `createStickToBottom` | The transcript keeps up with live capture until the student scrolls up | - |
| Long transcripts | `createVirtualizer` | Smooth scrolling on long lectures, find-in-page still works | - |
| Inline rename | `createInlineEdit` (Enter saves, Escape cancels, F2 edits) | Rename boards, panels and to-dos in place | - |
| Resizable side panels | `Resizable` (saves layout, keyboard, collapse) | Drag the Help me plan or drawer edge to size it; remembered | - |
| Swipe actions on phone | `createSwipeActions` | Swipe a to-do to complete or reschedule | - |
| Insert menu while typing | `Trigger Menu` (`@`, `/`, `#` at the caret) | Link a course, lecture or to-do from a note or annotation | - |

**Cross-component drag (future feature, decision 2.1).** When dragging between widgets becomes a product pattern (to-do onto the calendar panel, transcript moment onto the to-do list, files from the desktop onto audio capture), choose between:
- Atlassian Pragmatic drag and drop (`@atlaskit/pragmatic-drag-and-drop`), built for drags between components, windows and the desktop; you write the keyboard alternative and announcements (section 8).
- UI SDK `bindDrag` with our own drop handling, which keeps one event system and lets a dragged to-do become a live `createSpans` draft on the grid, at the cost of building the hit-testing ourselves.

## 7. Risks
- **Beta churn.** APIs may change between betas. Mitigation: exact pin, wrappers in shared-ui so most churn lands in one package, bump as its own PR.
- **Vite SPA is undocumented.** The rendering docs assume Next.js. K0 confirms it.
- **Phone drag vs scroll** on the time grid (spike 2).
- **Popover press-through** (spike 1); worst case we keep `closing-press.ts`.
- **Placement nuance** in calendar popovers may change slightly with `position()`; acceptable if the pressed block stays visible.

## 8. Drag and drop: UI SDK vs Atlassian Pragmatic drag and drop

| | UI SDK | Pragmatic drag and drop |
|---|---|---|
| Built on | Pointer events, live drafts committed on drop | The browser's native drag and drop |
| Move and resize boxes, snap grid, live layout while dragging | Yes (`createMove`, `createResize`, `createSpans`, `step`) | No. Drop targets only; the preview is a browser-made image |
| Sortable lists, moving between lists | Yes (`createReorder`, `createTransfer`, trees) | Yes, with hitbox and drop-indicator helpers |
| Between unrelated components, other windows, desktop files | Not documented | Yes (element, text selection and external adapters) |
| Keyboard dragging | Built in (Space/Enter pick up, arrows, Escape) | None. Atlassian recommends a menu of moves instead and advises against arrow keys |
| Screen-reader announcements | Built in, overridable | `live-region` helper; you write the messages |
| Touch | `touch-action: none` on drag surfaces | Claims iOS and Android support; few details |
| Licence, maturity | Apache-2.0, beta | Apache-2.0, 4.0.0, used in Trello, Jira, Confluence; no outside contributions |

Our main surfaces (calendar blocks, board panels, tab and step reorder) are direct manipulation, which Pragmatic drag and drop doesn't do. Its strength is moving things between components and from outside the browser. The two libraries can sit together (different event systems), so Pragmatic is a candidate for the future cross-component drag feature (section 6), not a reason to change this plan.

## 9. Estimated shape
- K0: 1 ticket with 3 parallel spikes.
- K1-K5: 6 PRs into `ui-sdk` (K4 split into K4a and K4b), each one implementer, one reviewer, one fix round.

## 10. Outcome (2026-11-27)

Merged to `main` in #166 (`bcf1998`). Each ticket had one review and a full-suite run before it merged into `ui-sdk`.

| Ticket | PR | What |
|---|---|---|
| K0 | #146 | Pinned install (`0.1.0-beta.16`), test stubs, `checkPattern`. Spikes: #147 (calendar, kept open as a draft for the mobile work), #148 and #149 (closed). |
| K1a / K1b / K1c | #152 / #151 / #150 | shared-ui Popover, Dialog, AlertDialog, Menu, Drawer; toast and theme (Light / Dark / System); TimeInput, DatePicker, SegmentedControl. |
| K2a / K2b | #153 / #154 | Shell overlays (board menu, Activity, dialogs); board tab reorder by keyboard. |
| K3 | #155 | Calendar popovers and forms on the shared Popover and TimeInput. |
| K4a1 / K4a2 | #158 / #159 | Calendar grid on `createSpans`: blocks and Help me plan suggestions move and resize by pointer and keyboard, with announcements; midnight rules. |
| K5 / K5b | #156 / #157 | Board panels on `createMove` / `createResize`, keyboard move and resize; panel layouts no longer revert after switching board. |
| W1 / W2 / W3 | #161 / #160 / #162 | Review leftovers and the review-ripple flake; Dialog `initialFocus`; keyboard walkthrough fixes. |
| M1 | #164, #165 | Merged `main` #106-#163 into `ui-sdk` (see "Process lessons"). |
| S1 | #163 | A Weekly plan board in the seed data (straight to `main`). |

### Where the result differs from this plan
- **Board canvas:** `main`'s #139 won over K5's always-snap. Placement is free; Shift while dragging or resizing snaps to the 20px grid, shows the outline, nudges covered neighbours and keeps the 20px gap from the canvas edges. K5's Shift aspect lock was dropped. Keyboard is K5's: Alt+arrow moves or resizes 20px, Shift+Alt+arrow 200px.
- **Calendar popovers:** `main`'s #113 won over K3's "the pressed block stays visible". The buttons stay still while the lecture loads in, even if the popover then covers the block. Bounds: on a phone, the calendar panel within the window (opens above only if it fits, else below); on desktop, the window, so it may spill past the calendar panel. A popover that opens above scales in from its bottom edge.
- **Calendar keyboard:** Delete on a focused block or commitment opens its existing inline confirm armed (no new dialog or copy). Left/Right on a suggestion on the first or last day shown does nothing. Auto-scroll while dragging stays off. A block can't be dragged across midnight (`createSpans` clamps to the day); each day's piece is its own span and moving either moves the whole block.
- **Overlays:** Dialog and Drawer slide out and go non-modal as they start closing; AlertDialog hides at once (UI SDK makes it always modal, so an animated exit would keep the page inert).
- **Reduced motion:** UI SDK's drawer fades for 150ms instead of sliding (it has no option to turn that off). Accepted: nothing moves; `motion.e2e.ts` asserts nothing but the drawer animates.
- **Seed:** the seeded student has four boards, so Up next is an icon at 1440x900 (accepted).
- K4b (phone long-press drag) was not built. See below.

### Left for later
- **Mobile.**
  - Long-press drag on the calendar grid (K4b). Today the grid is `touch-action: none`, as before the migration. The spike (#147, `localStorage['spike-touch']='hold'`) used `bindHold` (400ms), `pan-y` tracks and a non-passive `touchmove` blocker once held. In Chromium that gave scroll on swipe, drag on long-press and draw on long-press on empty time. On a real iPhone everything worked except **a long-press then slide on a block, which neither moves it nor scrolls**. Start there, red on a real device. Playwright can't swipe-scroll in WebKit.
  - `PanelChrome.tsx` header is always `touch-action: none`, even when the panel can't move (phone stacked layout, fullscreen).
  - Native vs UI SDK pickers on phones (Help me plan's PickTime is still a native `datetime-local`); bottom-sheet editing, swipe between days, full-screen calendar, header density, phone overflow (clipped calendar header, popover over the date wheel).
- **Accessibility pass** (from a keyboard-only walkthrough of every journey):
  - Focus drops to the page when the pressed control disappears: Test Me (Reveal, Got it / Didn't get it), Upload submit, "Remove X from board", Help me plan "Schedule ...", dismissing a suggestion, To-do "Not doing".
  - Accepting the last suggestion moves focus to Auto-fill, not the new block; accept and dismiss are not announced.
  - `ReviewAutomationSentence.tsx`'s resting hint sits in a `role=status`, so it is announced whenever the board menu or Automations dialog opens.
  - Suggestion blocks are focusable `div`s with no role (committed blocks use `role=button`).
  - `]` (next panel) does nothing while focus is in the top bar.
  - The tag toolbar is 18 Tab stops after the selected moment, with no shortcut.
  - After Create board, focus returns to "New board", not the new board.
  - Not keyboard: the calendar's "58m free" label can overlap a block.
- **Up next and board-course popups** (from `main`) are still hand-rolled; move them onto the shared Popover / Menu.
- Section 6's possibilities and the two cross-component drags are unchanged.

### UI SDK notes
- Pinned at `0.1.0-beta.16`. Its agent docs ship in the package: `@ui-sdk/core/docs/core.md`, `@ui-sdk/react/docs/llms.txt`. No `web.css`: everything is styled from our Tailwind tokens.
- The Drawer is removed from the page when closed (not `aria-hidden`).
- The toast region sits on the top layer at full width on a phone; it is `pointer-events-none` with each toast `pointer-events-auto`, or it eats taps on whatever is under it.
- `createSpans` deletes a span on Delete; the calendar intercepts it first for our confirm.
- Popover placement: measure in layout pixels, not on screen during the scale-in (it reads about 4% short), and round the anchor rect and offsets to whole pixels. The calendar places its popover through a virtual anchor that UI SDK reads every frame (`calendar-popover.tsx`).

### Process lessons
- Cut an integration branch from a freshly fetched `origin/main`. `ui-sdk` was cut from a local `main` that was a month stale (#105), so 26 PRs had to be merged in at the end: 41 conflicting files, about 1.5M tokens of builder time.
- Merge `main` into a long-lived branch as it moves, not once at the end.
- Merge a PR that carries a merge of `main` with a merge commit, not a squash. #164 was squashed, which dropped `main` as a parent; `git merge -s ours origin/main` (no content change) restored it before #166.
