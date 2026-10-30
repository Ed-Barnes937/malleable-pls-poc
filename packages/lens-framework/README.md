# @pls/lens-framework

Plugin system and type definitions for all lens implementations.

## Overview

Defines the contract that every lens must satisfy and provides the registry infrastructure for lazy-loading lenses at runtime. Any new lens package depends on this for its types.

## Key Exports

| Export | Description |
|--------|-------------|
| `LensProps` | Interface every lens component receives (`panelId`, `scope`, `config`) |
| `PanelManifest` | Per-lens metadata: label, icon, `reads`/`writes` (declaring `writes` grants writer access), `scope` declaration, sizes |
| `Scope` | Board scope shared by every widget (`courseTag`, `lectureId`); the server keeps the lecture inside the course |
| `ScopeDeclaration` | How a widget responds to each scope dimension (see `docs/technical-guidance.md`, Scope declarations) |
| `splitScope()` / `activeScopeDims()` / `canWrite()` | Shell helpers applying the declarations (`LensProps.scope` for readers, `LensProps.highlight` for styling only) |
| `DateRange`, `weekRange()`, `lookAheadRange()` | Widget-owned time windows passed to readers |
| `LensRegistry` / `LensRegistryProvider` | React context for the active set of lenses |
| `getLensComponent()` | Lazy-loads and caches a lens component by key |
| `PlaceholderLens` | Fallback rendered while a lens is loading |
| `useMissedBlocks()` | Study blocks that didn't happen, for any widget that offers to re-fit them (To-do, Calendar): the server's preview, an atomic accept, the shared copy (`missedQuestion`, `movedNote`, ...) which blocks the student already answered for (shared by every widget until the page is reloaded), and which a widget is previewing (`startPreview` / `endPreview`: other widgets stop asking about them meanwhile) |

## Usage

```tsx
import { LensRegistryProvider, getLensComponent } from "@pls/lens-framework";

const manifest: PanelManifest = {
  id: "weekly-overview",
  label: "Your Progress",
  icon: CalendarIcon,
  description: "How sure you feel, course by course",
  scope: { courseTag: "filter", lectureId: "ignore" },
  reads: ["weekly_overview"],
  load: () => import("@pls/lens-weekly-overview"),
};

<LensRegistryProvider registry={registry}>
  {/* panels resolve lenses from context */}
</LensRegistryProvider>
```
