# Task 003: Canvas engine — 8-handle resize + shift-snap

## Status: complete

## Summary
Add 8-handle resize (4 corners + 4 edges) and shift-snap (20px grid) to the freeform canvas engine built in task-002.

## Acceptance criteria
- [x] `resizePanel(id, pos_x, pos_y, width, height)` store action with clamping
- [x] `SizeConstraints` interface with min/max width/height
- [x] System default minimum 200x150px
- [x] 8 resize handles (nw, n, ne, e, se, s, sw, w) on each panel
- [x] Handles use raw pointer events (not Motion drag)
- [x] Corner handles adjust pos + dimensions simultaneously
- [x] Edge handles adjust one axis only
- [x] Correct cursor on each handle direction
- [x] Handles are invisible hit zones (~8px edges, ~12px corners)
- [x] Handles only interactive on panel hover
- [x] Shift-snap during drag snaps position to 20px grid
- [x] Shift-snap during resize snaps dimensions to 20px grid
- [x] Panel transitions (200ms ease-out) at rest, disabled during gestures
- [x] Tests: resizePanel store action, clamping, snap utility

## Decisions

### 2025-05-21: clampDimensions as exported pure function
Extracted `clampDimensions()` as a standalone exported function rather than embedding it only in the store action. This allows the resize handle component to pre-clamp dimensions before adjusting position for leading-edge handles (nw, n, w, sw), preventing the panel from "jumping" when clamping kicks in.

### 2025-05-21: Shift key tracked via ref, not state
Used `useShiftKey()` hook returning a `RefObject<boolean>` instead of React state. This avoids re-rendering the entire canvas tree on every Shift press/release. The ref is read synchronously inside pointer-move handlers where it's needed.

### 2025-05-21: Snap applies during drag via onDrag callback
For shift-snap during Motion drag, we hook into the `onDrag` callback to override `x`/`y` motion values in real-time when Shift is held, rather than only snapping on drag-end. This gives visual snap feedback during the gesture.

### 2025-05-21: Transitions disabled during gestures via isGesturing state
A `isGesturing` boolean state is set true on `onDragStart` and false on `onDragEnd`. When gesturing, the CSS `transition` property is removed from the panel to prevent lag. Resize handles manage their own pointer capture so they don't set this flag — they write directly to the store on each pointer-move, and the transition would only apply to external programmatic changes.

### 2025-05-21: Resize handles stop propagation to avoid triggering panel drag
Each resize handle calls `e.stopPropagation()` and `e.preventDefault()` on pointer-down to prevent the event from bubbling up to the Motion drag handler. This keeps resize and drag coexisting on the same element.
