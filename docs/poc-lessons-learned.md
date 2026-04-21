# POC Lessons Learned

Practical findings from building the POC that should inform MVP decisions. These are things that weren't obvious from the design docs and would be costly to rediscover.

---

## Layout: Swapy is incompatible with React

**What happened:** Swapy's `manualSwap: false` mode physically moves DOM nodes to perform swaps. This directly conflicts with React's virtual DOM — React expects to own the DOM tree, but Swapy mutates it behind React's back. The result was cascading bugs: frozen tabs, broken re-renders, and state corruption when Swapy's `onSwap` fired mid-animation and triggered React re-renders via TanStack Query invalidation.

**What we tried:** Deferring mutations to `onSwapEnd`, adding generation counters to force re-initialization, switching to `manualSwap: true`. None solved the fundamental conflict.

**What worked:** Replaced Swapy entirely with **react-grid-layout v2**, which is React-native. It handles drag, resize, collision detection, and vertical compaction without conflicting with React's rendering model.

**MVP guidance:** Use react-grid-layout (or a React-native equivalent). Any layout library that manipulates the DOM directly (Swapy, Muuri, Packery) will cause the same class of bugs. This is not a Swapy-specific issue — it's a DOM-ownership conflict. The technical-guidance.md already recommends React Grid Layout; this confirms it empirically.

---

## react-grid-layout v2 API changes

The v2 API is significantly different from v1. The most notable change: **`WidthProvider` HOC no longer exists**. It's replaced by the `useContainerWidth` hook:

```tsx
// v1 (deprecated)
const ResponsiveGridLayout = WidthProvider(Responsive)

// v2
const { width, containerRef } = useContainerWidth({ initialWidth: 1200 })
<div ref={containerRef}>
  <Responsive width={width} ... />
</div>
```

The official `@types/react-grid-layout` package was out of date during POC development and conflicted with v2's API. We dropped it and wrote a custom `.d.ts` declaration file. Check whether types have caught up before the MVP.

---

## CJS/ESM interop in Vite

**What happened:** react-grid-layout publishes both CJS (`dist/index.js`) and ESM (`dist/index.mjs`) via the `exports` field. Vite dev mode serves ESM, but Rollup (production build) resolves CJS differently. We cycled through four broken import approaches before finding one that works in both:

```typescript
// What works (v2 named ESM exports):
import { Responsive, useContainerWidth, type LayoutItem } from 'react-grid-layout'

// What doesn't:
// - require() — doesn't exist in Vite ESM dev mode
// - import RGL from 'react-grid-layout' + destructure — breaks dev or build depending on approach
// - Mixed default + named imports — Rollup rejects them
```

**MVP guidance:** Always check the package's `exports` field in `package.json` to understand what's actually available. Use `node -e "console.log(Object.keys(require('pkg')))"` to inspect CJS exports if unsure. For packages with both CJS and ESM, use the named ESM imports.

---

## Client-side DB schema versioning is mandatory

**What happened:** Changing the `workspace_panels` table schema (adding `grid_x/y/w/h` columns) broke every existing user's localStorage database. The old DB loaded successfully but queries returned `undefined` for the new columns, producing `NaN` layout values that sent react-grid-layout into an infinite computation loop — hard-freezing the browser tab so badly that users couldn't even open DevTools to debug.

**What we added:** A `SCHEMA_VERSION` constant and a `isSchemaValid()` check that inspects the actual table columns on load. If the version is missing or the schema doesn't match, the DB is automatically reset with fresh seed data.

**MVP guidance:** This will be even more critical with real user data. The MVP needs:
- A proper migration system (not just reset) — users will have data they care about
- Schema version stored in the DB itself (a `meta` table), not just localStorage
- Forward-compatible schema design — prefer adding columns with defaults over renaming/removing
- Consider IndexedDB or OPFS instead of localStorage (which has a ~5-10MB limit and serialization overhead)

---

## Large binary serialization can blow the call stack

**What happened:** `persistDb()` used `btoa(String.fromCharCode(...new Uint8Array(data)))` to serialize the sql.js database to localStorage. The spread operator passes every byte as a separate argument to `String.fromCharCode()`. On larger databases, this exceeded the maximum call stack size on some browsers, crashing on first load.

**Fix:** Replace the spread with a simple loop:

```typescript
const bytes = new Uint8Array(dbInstance.export())
let binary = ''
for (let i = 0; i < bytes.length; i++) {
  binary += String.fromCharCode(bytes[i])
}
localStorage.setItem('pls-db', btoa(binary))
```

**MVP guidance:** Avoid spreading large arrays into function arguments. For the MVP, move away from localStorage + base64 entirely — use IndexedDB which stores binary blobs natively without serialization overhead.

---

## TanStack Query invalidation can cause infinite render loops

**What happened:** react-grid-layout fires `onLayoutChange` on every render (including the initial one) with the compacted layout. If that layout differs from what's in the DB (e.g., after vertical compaction adjusts positions), the handler calls `updateLayouts.mutate()`, which invalidates the query cache, which re-fetches panels, which triggers a new render, which fires `onLayoutChange` again.

**What we added:** A dirty-check that compares the new layout against the current DB state and only mutates if something actually changed:

```typescript
const changed = currentLayout.some((item) => {
  const panel = panels.find(p => p.id === item.i)
  return panel.grid_x !== item.x || panel.grid_y !== item.y || ...
})
if (!changed) return
```

**MVP guidance:** Any mutation triggered from a render-time callback (layout change, scroll position, resize) needs a guard against no-op updates. This is a general TanStack Query pattern — invalidation triggers re-renders, which can re-trigger the callback. The guard must compare against the source of truth (DB/server state), not just the previous callback value.

---

## CSS container queries: height requires extra setup

Tailwind CSS v4's `@container` variant only supports **width-based** queries. For height-responsive components (e.g., the audio capture lens adapting to small panel heights), you need:

1. `container-type: size` (not `inline-size`, which is Tailwind's default) — enables height queries
2. A custom Tailwind variant for height breakpoints:

```css
@custom-variant @tall (@container (min-height: 200px));
@utility container-size { container-type: size; }
```

This is purely CSS — no JavaScript ResizeObserver needed. But `container-type: size` creates a size containment context in both dimensions, which can affect layout if the container doesn't have an explicit height.

---

## Cross-lens reactivity via TanStack Query works well

The core bet of the POC — that TanStack Query invalidation chains can drive cross-lens reactivity without lenses knowing about each other — is validated. The pattern:

1. Lens A calls a mutation (e.g., `useCreateTag('confused')`)
2. The mutation's `onSuccess` invalidates relevant query keys (`tags`, `weekly_overview`, `gap_analysis`)
3. Lenses B, C, D that consume those queries automatically re-render with fresh data

This is simple, debuggable (TQ devtools show exactly what invalidated), and scales to any number of lenses. No event bus, no pub/sub, no lens-to-lens coupling.

**MVP guidance:** Keep this pattern. The only refinement needed is more granular invalidation keys (e.g., scoped by course/recording) to avoid unnecessary re-fetches as the data set grows.

---

## What the POC doesn't prove

Things that still need validation in the MVP:

- **Performance at scale** — sql.js with ~100 rows is instant. Will TanStack Query + Postgres stay responsive with thousands of recordings and tens of thousands of transcript segments?
- **Persistence reliability** — localStorage is fragile (size limits, eviction, no transactions). The MVP needs a real persistence story.
- **Collaboration** — No multi-user, no shared workspaces. The substrate-mediated reactivity pattern should extend to server-pushed updates, but that's unproven.
- **Lens isolation under real conditions** — All lenses are first-party in the POC. Community lenses will need sandboxing (iframe or shadow DOM) and a validated data contract.
- **Mobile layout** — The 3-column grid doesn't work on mobile. The MVP needs a responsive layout strategy (stacked panels, swipe between lenses, or a different mobile shell).
