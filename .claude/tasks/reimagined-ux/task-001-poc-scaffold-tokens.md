---
id: task-001
epic: reimagined-ux
title: POC scaffold + warm material tokens
status: in-progress
branch: reimagined-ux-task-001
---

# Task 001: POC scaffold + warm material tokens

## Objective

Create a new Vite app at `apps/canvas-poc/` that serves as the scaffold for the reimagined UX POC. Define all warm material design tokens as CSS custom properties using OKLCh colour space, with dark/light theme support and a working toggle.

## Acceptance criteria

- [ ] New app at `apps/canvas-poc/` following existing monorepo patterns
- [ ] Starts with `pnpm dev:poc` from root
- [ ] Renders a warm-toned empty canvas page (full viewport minus top padding)
- [ ] Working dark/light theme toggle
- [ ] All warm material tokens defined as CSS custom properties
- [ ] Tests pass via `vitest`

## Decisions

- **2026-05-21**: Added text token layer (`text-primary`, `text-secondary`, `text-muted`) with warm hue 60 for both themes -- the PRD specified surface/border/accent tokens but text colours were needed for practical use.
- **2026-05-21**: Light mode shadows use slightly reduced opacity vs dark mode for visual consistency on light backgrounds.
- **2026-05-21**: Widened vitest `include` glob to also match `apps/**/src/**/*.test.{ts,tsx}` so tests can live alongside app source (previously only `packages/` was covered).
- **2026-05-21**: Canvas area uses a `surface-raised` inner container with `shadow-panel` and `radius-panel` to demonstrate the tokens visually on first load.
