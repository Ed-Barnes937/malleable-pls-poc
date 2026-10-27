# @pls/panel-system

Freeform canvas for widget panels: drag, resize, fullscreen, focus mode and keyboard shortcuts.

## Overview

Panels are absolutely positioned on a canvas (`CanvasEngine`), driven by a Zustand store (`useCanvasStore`). The shell persists layout changes through `onLayoutChange`, which always reports a fullscreen panel at its pre-fullscreen layout (`persistableLayout`), so fullscreen never survives a reload. Fullscreen, focus mode and selection reset whenever the panel set is replaced (e.g. switching boards).

On a canvas narrower than `STACK_BREAKPOINT` (640px) panels render in one scrolling column at full width, in reading order, without drag, resize or fullscreen. This is presentation only: the saved free layout is untouched and returns when the canvas widens.

## Components and helpers

| Export | Description |
|--------|-------------|
| `CanvasEngine` | Canvas container: renders panels, drag/resize, narrow stacked layout |
| `PanelChrome` | Panel header (title, actions, fullscreen, remove) and content area |
| `useCanvasStore` | Panels, selection, focus mode, fullscreen, organize, background |
| `findFreeSpot` | First free top-left for a new panel of a given size (used when a widget is added by click) |
| `WorkspaceBackground`, `BackgroundPicker` | Board background |
