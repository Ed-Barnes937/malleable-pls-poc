# @pls/web

Main web application that orchestrates all lens packages into an interactive personal learning system.

## Overview

This is the entry point for the PLS. It initialises the browser-based SQLite database, sets up React Query for state management, and lazy-loads lens components through the lens registry.

## Tech Stack

- React 19 + Vite
- Tailwind CSS 4
- TanStack React Query
- sql.js (browser SQLite)

## Getting Started

```bash
# from the monorepo root
pnpm install
pnpm --filter @pls/web dev
```

The dev server starts at `http://localhost:5173`.

## Key Files

| File | Purpose |
|------|---------|
| `src/main.tsx` | Database init, QueryClient setup, app mount |
| `src/App.tsx` | Lens registry definition and lazy-loading |

## Internal Dependencies

All lens packages, plus `substrate`, `workspace-shell`, `panel-system`, and `shared-ui`.
