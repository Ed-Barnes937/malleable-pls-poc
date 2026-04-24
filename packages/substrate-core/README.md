# @pls/substrate-core

Low-level database abstraction layer, independent of React.

## Overview

Provides a generic wrapper around sql.js with pluggable storage adapters, schema versioning, and seeding. Designed to be consumed by `@pls/substrate` (which adds React hooks) but usable standalone for testing or non-React contexts.

## Key Exports

| Export | Description |
|--------|-------------|
| `createDatabase(config)` | Factory that returns a `SubstrateDatabase` instance |
| `SubstrateDatabase` | Interface: `query`, `exec`, `mutate`, `persist`, `reset`, `close` |
| `StorageAdapter` | Interface for pluggable persistence (memory, localStorage) |

## Usage

```ts
import { createDatabase } from "@pls/substrate-core";

const db = await createDatabase({
  schema: mySchema,
  storage: localStorageAdapter,
  seed: seedFn,
});

const rows = db.query("SELECT * FROM recordings");
```

## Design

- Dependency injection for storage, schema, and seeding
- Base64 encoding for localStorage persistence
- Schema version tracking for migrations
