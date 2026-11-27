# @pls/panel-system

Freeform canvas for widget panels: drag, resize, fullscreen, focus mode and keyboard shortcuts.

## Overview

Panels are absolutely positioned on a canvas (`CanvasEngine`), driven by a Zustand store (`useCanvasStore`). The shell persists layout changes through `onLayoutChange`, which reports only the panels that moved, once a drag or resize ends (`gesturePanelId`), and always reports a fullscreen panel at its pre-fullscreen layout (`persistableLayout`), so fullscreen never survives a reload. A new panel set (another board) is the baseline: loading one saves nothing, but a layout arranged as it arrives is saved. Fullscreen, focus mode and selection reset whenever the panel set is replaced (e.g. switching boards).

### Placement (flow audit proposal 5)

Placement is free of other widgets: a widget can be dragged or resized anywhere, overlapping others. Holding Shift during a drag or resize snaps it to the 20px grid, `PLACEMENT_GAP` from the canvas's edges (`snapMove` and `snapResize` in `layout.ts`; a drag also wholly on the canvas); during a drag or resize Shift shows a dashed outline of where it, and each widget it would cover, will land (`shiftPreview`), and on drop nudges every widget it covers to the nearest free spot in view (`nudgeCovered`); with none, the widget goes below the lowest one and the board grows to fit. Letting go of Shift mid-gesture is back to free placement. Tidy up (`tidyLayout`) fills the board's area: the Calendar (else the largest widget) leads at full height on the left, keeping its width where the others fit beside it, and the rest fill columns to its right, keeping their own heights where they fit. The board scrolls down to its lowest widget, so none is ever cut off at the bottom.

On a canvas narrower than `STACK_BREAKPOINT` (640px) panels render in one scrolling column at full width, in reading order, without drag, resize or fullscreen. This is presentation only: the saved free layout is untouched and returns when the canvas widens.

## Moving and resizing

Moving and resizing run on UI SDK's `createMove` and `createResize`, in the `panel-board` primitive (`panel-board.ts`):

- Drag a panel by its header, or select it (click, or `]` / `[`) and press Alt+arrow. Each of the 8 resize handles is a button named like "Resize Transcript bottom right": drag it, or focus it and use the arrows (an edge handle only along its axis). Shift with a key goes ten steps.
- A pointer drag is free: the panel lands where it is dropped. A key press steps the 20px grid (`GRID_SIZE`), landing an off-grid panel back on it. Shift on a resize corner snaps, as on an edge; it keeps no shape.
- Hold Shift while dragging or resizing and a dashed outline shows where the widget lands (a drag: wholly on the canvas, `PLACEMENT_GAP` from its edges) and where anything it would cover is nudged to (`nudgeCovered` in `layout.ts`); dropping puts them there. Without Shift, widgets may overlap.
- While dragging, the panel already shows where it will land: snapped with Shift held, and kept on the canvas (`canvasBounds`: 100px or half the panel stays on it, the top edge never goes above it). Escape puts it back.
- Only the selected panel's handles are tab stops. Stacked, or while a panel is fullscreen, nothing moves or resizes and no handles render.
- Screen readers hear UI SDK's announcement after each move or resize ("Transcript moved to 640, 100.", "Transcript resized to 460 by 440.").
- `onLayoutChange` gets only the panels that moved, once per gesture (a press that raises a panel and the drag that follows save together), never per pointer move, and not for a drag Escape put back. A run of key presses (a held Alt+arrow) saves once, `KEY_SAVE_DELAY` after the last.

### Motion

Panels use the app's shared motion (`motion.ts` in `@pls/shared-ui`), and motion/react is the only thing that animates a panel element (its opacity and transform), so arriving, leaving, dimming and gliding never fight a CSS transition. A panel added to the board arrives and a removed one leaves (`AnimatePresence`); a new panel set (`setPanels`, counted by `panelSet`) is shown at once, and slides in as a whole from `slideFrom` when the shell gives one (another board, from its tab's side). Changes that move panels without a drag (fullscreen in and out, Tidy up and its Undo, a Shift drop's nudges: `arrangePanels`) bump `arranged`: each panel is laid out at its new box at once and glides there from where it was on screen by transform only, the board's scroll included, with a resized panel's content hidden for the glide's first frames while it is laid out afresh, then faded in drawn at its own size (scaled against the card, so it never stretches), so nothing jumps or counts as a layout shift. A drag started mid-glide carries on from where the glide had the panel. While one panel is fullscreen the others step back behind it and are inert. None of this moves under reduced motion.

## Components and helpers

| Export | Description |
|--------|-------------|
| `CanvasEngine` | Canvas container: renders panels, drag/resize, narrow stacked layout |
| `PanelChrome` | Panel header (title, actions, fullscreen, remove) and content area |
| `useCanvasStore` | Panels, selection, focus mode, fullscreen, arranging, gestures, background |
| `tidyLayout` | Tidy up's layout for a board's widgets and area |
| `findFreeSpot`, `placeNewPanel` | Where a new panel goes (used when a widget is added by click) |
| `canvasBounds` | Where a moving panel's top-left may go on the canvas |
| `WorkspaceBackground`, `BackgroundPicker` | Board background |
