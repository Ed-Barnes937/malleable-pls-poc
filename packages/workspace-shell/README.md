# @pls/workspace-shell

Main application shell - top bar, board menu (drawer), canvas orchestration and board management.

## Overview

Provides the top-level layout that composes the top bar, the board menu, the panel canvas and supporting chrome (theme toggle, activity, board tabs, automations). Manages which widgets (lenses) are loaded, their scope context and panel lifecycle.

Student-facing copy follows the vocabulary in `plans/student-planning-demo.md` section 1: widget (lens), board (workspace), "Showing" course and lecture pills (scope), automation (workflow), lecture (recording). Code identifiers keep their names.

## Components

| Component | Description |
|-----------|-------------|
| `WorkspaceShell` | Root layout: top bar + board menu + canvas; adds widgets (palette click places in the first free area, drag drops at the cursor) |
| `TopBar` | Board menu button, board tabs, scope pills (`BoardScope`), Up next (`UpNext`), activity, theme, appearance, tidy up. On a phone the pills and Up next share a second row, Up next wrapping under the pills when they leave it less than 40% |
| `UpNext` | The top bar's "Up next: Cafe shift 17:00" button ("now" while one is on, "Plan your week" with nothing booked), at every width. Opens a popover: the next 5 calendar items by day, what is due this week, a summary line, "Plan my week" (Help me plan in Week view on this board's Calendar, adding one when there is none; never switches boards) and "Add Calendar to this board". Times use the student's zone; the week is Monday to Sunday. The pure part is `up-next.ts`. The shell asks a Calendar to open Help me plan through `requestHelpMePlan` (`@pls/lens-framework`), which waits for a Calendar that is still being added |
| `BoardScope` | "Showing [Biology] > [Mitochondrial DNA]": a course pill and (when a widget targets or highlights the lecture) a lecture pill, only for dimensions some widget uses. One `setBoardScope` per choice, shown at once (writes go one at a time, in order). A "..." menu beside the lecture pill renames the lecture inline (`lectures.update`) or deletes it (`lectures.deletePreview`, then at once when empty, else after `DeleteLectureDialog` lists what goes); for a lecture filed under no course it also offers "Choose a course..." (`lectures.update({ course })`), as does a "Choose a course" pill beside it from the `lg` breakpoint up. Short of room the lecture title is cut short first (down to its floor), before the board tabs; on a phone both pills cut long names short (course down to 5rem, lecture to 6rem, the whole name in the tooltip and the list) and the chevron goes, so the pills, the lecture menu and Up next share one line from 360px |
| `ScopePill` | A content-sized dropdown pill: a transparent native `<select>` over a styled label (dot, ellipsis, chevron), so keyboard and the phone's picker are native. A change made by a key (a closed select on Windows and Linux changes per arrow press) is a draft until Enter or leaving the pill; Escape drops it |
| `DrawerSidebar` | Board menu: widget palette, board automations (and on a phone, Activity, theme and appearance); opens at the top |
| `PanelContainer` | Wrapper connecting a panel slot to its lens |
| `ThemeToggle` | Light / dark mode switch |
| `JobStatusIndicator` | Activity button and panel for background automation runs |
| `WorkspaceSwitcher` | Board tabs (scroll sideways on narrow screens); the open board's tab carries its delete button |
| `WorkspaceDialogs` | New board (name + optional course) and delete board dialogs |
| `WorkflowSettingsPanel` | Board menu overview of the board's automations |
| `LensAutomationsButton` | Per-panel button opening the widget's automations |

## Widget palette groups

The palette groups widgets by `PanelManifest.group` (`capture`, `study`, `plan`, `review`, in that order; see `widget-groups.ts`). To add a widget, declare its `group` on the manifest and register the manifest in `apps/web/src/App.tsx`. A widget with no group appears under "More widgets".

## State

Uses a Zustand store (`useWorkspaceStore`) for the chosen board (`activeWorkspaceId`, remembered per user in localStorage on this device so a reload reopens it: `lastBoard.ts`) and `focusedPanelId`. The open board is `useActiveWorkspaceId()`: the chosen board while the student still has it, otherwise their first board in tab order, which is also where a remembered board that was since deleted falls back to (null while boards load or when they have none, which shows a "New board" prompt). Fullscreen, focus mode and selection live in the panel-system canvas store and are never persisted.

## Internal Dependencies

`panel-system`, `substrate`, `shared-ui`, `workflows`, `lens-framework`
