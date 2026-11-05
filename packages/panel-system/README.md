# @pls/panel-system

Freeform canvas for widget panels: drag, resize, fullscreen, focus mode and keyboard shortcuts.

## Overview

Panels are absolutely positioned on a canvas (`CanvasEngine`), driven by a Zustand store (`useCanvasStore`). The shell persists layout changes through `onLayoutChange`, which always reports a fullscreen panel at its pre-fullscreen layout (`persistableLayout`), so fullscreen never survives a reload. Fullscreen, focus mode and selection reset whenever the panel set is replaced (e.g. switching boards).

On a canvas narrower than `STACK_BREAKPOINT` (640px) panels render in one scrolling column at full width, in reading order, without drag, resize or fullscreen. This is presentation only: the saved free layout is untouched and returns when the canvas widens.

### Motion

Panels use the app's shared motion (`motion.ts` in `@pls/shared-ui`), and motion/react is the only thing that animates a panel element (its opacity and transform), so arriving, leaving, dimming and gliding never fight a CSS transition. A panel added to the board arrives and a removed one leaves (`AnimatePresence`); a new panel set (`setPanels`, counted by `panelSet`) is shown at once, and slides in as a whole from `slideFrom` when the shell gives one (another board, from its tab's side). Changes that move panels without a drag (fullscreen in and out, Tidy up) bump `arranged`: each panel is laid out at its new box at once and glides there from where it was on screen by transform only, the board's scroll included, with a resized panel's content hidden while it is laid out afresh and faded back in, so nothing jumps or counts as a layout shift. While one panel is fullscreen the others step back behind it. None of this moves under reduced motion.

## Components and helpers

| Export | Description |
|--------|-------------|
| `CanvasEngine` | Canvas container: renders panels, drag/resize, narrow stacked layout |
| `PanelChrome` | Panel header (title, actions, fullscreen, remove) and content area |
| `useCanvasStore` | Panels, selection, focus mode, fullscreen, organize, background |
| `findFreeSpot` | First free top-left for a new panel of a given size (used when a widget is added by click) |
| `WorkspaceBackground`, `BackgroundPicker` | Board background |
