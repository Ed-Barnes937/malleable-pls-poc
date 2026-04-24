# @pls/lens-framework

Plugin system and type definitions for all lens implementations.

## Overview

Defines the contract that every lens must satisfy and provides the registry infrastructure for lazy-loading lenses at runtime. Any new lens package depends on this for its types.

## Key Exports

| Export | Description |
|--------|-------------|
| `LensProps` | Interface every lens component receives (`panelId`, `scope`, `config`) |
| `LensMeta` | Metadata for a lens (`label`, `icon`, `description`, `category`) |
| `Scope` | Shared filtering context (`courseTag`, `recordingId`, `timeframe`) |
| `LensRegistry` / `LensRegistryProvider` | React context for the active set of lenses |
| `getLensComponent()` | Lazy-loads and caches a lens component by key |
| `PlaceholderLens` | Fallback rendered while a lens is loading |

## Usage

```tsx
import { LensRegistryProvider, getLensComponent } from "@pls/lens-framework";

const registry = {
  "weekly-overview": {
    meta: { label: "Weekly Overview", icon: CalendarIcon, category: "view" },
    load: () => import("@pls/lens-weekly-overview"),
  },
};

<LensRegistryProvider registry={registry}>
  {/* panels resolve lenses from context */}
</LensRegistryProvider>
```
