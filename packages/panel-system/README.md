# @pls/panel-system

Freeform canvas for widget panels: drag, resize, fullscreen, focus mode and keyboard shortcuts.

## Overview

Panels are absolutely positioned on a canvas (`CanvasEngine`), driven by a Zustand store (`useCanvasStore`). The shell persists layout changes through `onLayoutChange`, which reports only the panels that moved, once a drag or resize ends (`gesturePanelId`), and always reports a fullscreen panel at its pre-fullscreen layout (`persistableLayout`), so fullscreen never survives a reload. A new panel set (another board) is the baseline: loading one saves nothing, but a layout arranged as it arrives is saved. Fullscreen, focus mode and selection reset whenever the panel set is replaced (e.g. switching boards).

### Placement (flow audit proposal 5)

Placement is free: a widget can be dragged or resized anywhere, overlapping others. Holding Shift during a drag or resize snaps it to the grid (`snapMove`, `snapResize` in `layout.ts`), shows a dashed outline of where it, and each widget it would cover, will land (`shiftPreview`), and on drop nudges every widget it covers to the nearest free spot in view (`nudgeCovered`); with none, the widget goes below the lowest one and the board grows to fit. Letting go of Shift mid-gesture is back to free placement. Tidy up (`tidyLayout`) fills the board's area: the Calendar (else the largest widget) leads at full height on the left, keeping its width where the others fit beside it, and the rest fill columns to its right, keeping their own heights where they fit. The board scrolls down to its lowest widget, so none is ever cut off at the bottom.

On a canvas narrower than `STACK_BREAKPOINT` (640px) panels render in one scrolling column at full width, in reading order, without drag, resize or fullscreen. This is presentation only: the saved free layout is untouched and returns when the canvas widens.

### Motion

Panels use the app's shared motion (`motion.ts` in `@pls/shared-ui`), and motion/react is the only thing that animates a panel element (its opacity and transform), so arriving, leaving, dimming and gliding never fight a CSS transition. A panel added to the board arrives and a removed one leaves (`AnimatePresence`); a new panel set (`setPanels`, counted by `panelSet`) is shown at once, and slides in as a whole from `slideFrom` when the shell gives one (another board, from its tab's side). Changes that move panels without a drag (fullscreen in and out, Tidy up and its Undo, a Shift drop's nudges: `arrangePanels`) bump `arranged`: each panel is laid out at its new box at once and glides there from where it was on screen by transform only, the board's scroll included, with a resized panel's content hidden for the glide's first frames while it is laid out afresh, then faded in drawn at its own size (scaled against the card, so it never stretches), so nothing jumps or counts as a layout shift. A drag started mid-glide carries on from where the glide had the panel. While one panel is fullscreen the others step back behind it and are inert. None of this moves under reduced motion.

## Components and helpers

| Export | Description |
|--------|-------------|
| `CanvasEngine` | Canvas container: renders panels, drag/resize, narrow stacked layout |
| `PanelChrome` | Panel header (title, actions, fullscreen, remove) and content area |
| `useCanvasStore` | Panels, selection, focus mode, fullscreen, arranging, gestures, background |
| `tidyLayout` | Tidy up's layout for a board's widgets and area |
| `findFreeSpot` | First free top-left for a new panel of a given size (used when a widget is added by click) |
| `WorkspaceBackground`, `BackgroundPicker` | Board background |
