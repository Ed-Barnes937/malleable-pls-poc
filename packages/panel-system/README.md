# @pls/panel-system

Freeform canvas for widget panels: drag, resize, fullscreen, focus mode and keyboard shortcuts.

## Overview

Panels are absolutely positioned on a canvas (`CanvasEngine`), driven by a Zustand store (`useCanvasStore`). The shell persists layout changes through `onLayoutChange`, which always reports a fullscreen panel at its pre-fullscreen layout (`persistableLayout`), so fullscreen never survives a reload. Fullscreen, focus mode and selection reset whenever the panel set is replaced (e.g. switching boards).

On a canvas narrower than `STACK_BREAKPOINT` (640px) panels render in one scrolling column at full width, in reading order, without drag, resize or fullscreen. This is presentation only: the saved free layout is untouched and returns when the canvas widens.

## Moving and resizing

Moving and resizing run on UI SDK's `createMove` and `createResize`, in the `panel-board` primitive (`panel-board.ts`):

- Drag a panel by its header, or select it (click, or `]` / `[`) and press Alt+arrow. Each of the 8 resize handles is a button named like "Resize Transcript bottom right": drag it, or focus it and use the arrows (an edge handle only along its axis). Shift with a key goes ten steps.
- Everything lands on the 20px grid (`GRID_SIZE`). Shift on a resize corner keeps the panel's shape.
- While dragging, the panel already shows where it will land: snapped, and kept on the canvas (`canvasBounds`: 100px or half the panel stays on it, the top edge never goes above it). Escape puts it back.
- Only the selected panel's handles are tab stops. Stacked, or while a panel is fullscreen, nothing moves or resizes and no handles render.
- Screen readers hear UI SDK's announcement after each move or resize ("Transcript moved to 640, 100.", "Transcript resized to 460 by 440.").
- `onLayoutChange` runs once per drop, never per pointer move, and not for a drag Escape put back. A run of key presses (a held Alt+arrow) saves once, `KEY_SAVE_DELAY` after the last.

## Components and helpers

| Export | Description |
|--------|-------------|
| `CanvasEngine` | Canvas container: renders panels, drag/resize, narrow stacked layout |
| `PanelChrome` | Panel header (title, actions, fullscreen, remove) and content area |
| `useCanvasStore` | Panels, selection, focus mode, fullscreen, organize, background |
| `findFreeSpot`, `placeNewPanel` | Where a new panel goes (used when a widget is added by click) |
| `canvasBounds` | Where a moving panel's top-left may go on the canvas |
| `WorkspaceBackground`, `BackgroundPicker` | Board background |
