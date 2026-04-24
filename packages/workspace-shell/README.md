# @pls/workspace-shell

Main application shell — sidebar navigation, panel orchestration, and workspace management.

## Overview

Provides the top-level layout that composes the sidebar, panel grid, and all supporting chrome (theme toggle, job status, workspace switcher, workflow settings). Manages which lenses are loaded, their scope context, and panel lifecycle.

## Components

| Component | Description |
|-----------|-------------|
| `WorkspaceShell` | Root layout: sidebar + panel grid |
| `Sidebar` | Navigation and lens picker |
| `PanelContainer` | Wrapper connecting a panel slot to its lens |
| `ThemeToggle` | Light / dark mode switch |
| `JobStatusIndicator` | Background workflow job status |
| `WorkspaceSwitcher` | Switch between saved workspaces |
| `WorkflowSettingsDialog` | Configure workflow triggers and jobs |

## State

Uses a Zustand store (`useWorkspaceStore`) for `activeWorkspaceId` and `focusedPanelId`. Default workspace: `ws-evening-review`.

## Internal Dependencies

`panel-system`, `substrate`, `shared-ui`, `workflows`, `lens-framework`
