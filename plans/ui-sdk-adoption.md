# UI SDK Adoption - Orchestration Plan

**Date:** 2026-11-25
**Status:** Ready to orchestrate (decisions settled 2026-11-25)
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
           ├── K3 ── K4
           └── K5
```
K0 gates everything. K2, K3 and K5 run in parallel after K1. K4 follows K3 because both touch the calendar's press handling.

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
- Replace `popover-position.ts` and `useEscapeToClose`. Replace `closing-press.ts` only if spike 1 said yes; otherwise keep it on top of the new popover.
- Form: kind radio group -> `SegmentedControl`; date and times -> `DatePicker` and `TimeInput` (15-minute step); calendar view tabs -> `SegmentedControl`; `StudyHoursEditor` selects -> `TimeInput`.
- The #100 and #103 e2e cases must pass unchanged.

### K4 - Calendar grid on `createSpans`
- Move, resize and draw blocks through `createSpans` in `TimeGrid.tsx`, replacing the pointer drag code and the lane/column maths (`stackSpans`). Persistence stays on our mutations, called from the commit.
- New for keyboard users on committed blocks: arrows move (Up/Down in time, Left/Right across days), Shift+arrows resize, Delete asks the same "Delete it?" / "Delete every week?" confirm as the block popover (`EventPopover.tsx:207`), Escape cancels. Commitments stay fixed.
- AI suggestions (proposals) use the same spans; keep Enter accepts and Delete dismisses, and drop the hand-rolled nudge handler.
- Announcements use our copy via `message` (e.g. "Maths study moved to Tuesday 14:00 to 15:00").
- Help me plan drop-in stays native (decision 2.1); the grid's `onDragOver`/`onDrop` keep working next to the spans.
- Phone behaviour per spike 2 (scrolling must still work).

### K5 - Board panels on `createMove` / `createResize`
- Header drag and the 8 resize handles in `CanvasEngine.tsx` / `PanelChrome.tsx` on the behaviours, replacing the pointer code, `snap.ts` and the resize maths in `geometry.ts` (keep `anchoredPosition` and placement helpers that aren't drag-related).
- New for keyboard users: Alt+arrow moves the selected panel, resize handles are focusable buttons with arrow keys, Escape puts a drag back. Extend `useCanvasKeyboard.ts` shortcuts only where they don't clash.
- Narrow stacked layout: moving and resizing disabled, as today.

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
- K1-K5: 5 PRs into `ui-sdk`, each one implementer, one reviewer, one fix round. K4 is the largest.
