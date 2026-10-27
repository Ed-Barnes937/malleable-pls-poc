# @pls/workspace-shell

Main application shell - top bar, board menu (drawer), canvas orchestration and board management.

## Overview

Provides the top-level layout that composes the top bar, the board menu, the panel canvas and supporting chrome (theme toggle, activity, board tabs, automations). Manages which widgets (lenses) are loaded, their scope context and panel lifecycle.

Student-facing copy follows the vocabulary in `plans/student-planning-demo.md` section 1: widget (lens), board (workspace), "Showing: ..." (scope), automation (workflow), lecture (recording). Code identifiers keep their names.

## Components

| Component | Description |
|-----------|-------------|
| `WorkspaceShell` | Root layout: top bar + board menu + canvas; adds widgets (palette click places in the first free area, drag drops at the cursor) |
| `TopBar` | Board menu button, board tabs, "Showing: ..." chip, activity, theme, appearance, tidy up |
| `DrawerSidebar` | Board menu: widget palette, "Showing" scope pickers, board automations |
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

Uses a Zustand store (`useWorkspaceStore`) for `activeWorkspaceId` (default `ws-in-lecture`) and `focusedPanelId`. Fullscreen, focus mode and selection live in the panel-system canvas store and are never persisted.

## Internal Dependencies

`panel-system`, `substrate`, `shared-ui`, `workflows`, `lens-framework`
