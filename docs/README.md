# Malleable PLS - Ideation Documents

Ideation for a Personal Learning System built on malleable software principles. The platform's entry point is audio lecture capture; its purpose is enabling better learning through composable, user-arranged tools ("lenses") operating on a shared data substrate.

## Documents

| File | Purpose |
|------|---------|
| [terminology.md](terminology.md) | Core concepts, design principles, scaling rules, data primitives. **Read this first.** |
| [ux-concepts.md](ux-concepts.md) | What users see. Walkthrough, SPA comparison, workspace model, existing app references. |
| [implementation.md](implementation.md) | POC and MVP specs. Wireframes, stack, code patterns, data layer architecture. **Build from this.** |
| [technical-guidance.md](technical-guidance.md) | Full stack options (pragmatic vs local-first), schemas, monorepo structure, microfrontend migration path. |
| [technical-constraints.md](technical-constraints.md) | Mobile browser limitations, delivery model (web + Capacitor). |
| [monetisation.md](monetisation.md) | Revenue models (D2C, B2B, private lenses), flywheel, phasing. |
| [open-questions.md](open-questions.md) | Unresolved design questions to explore later. |

## Key Decisions Made

- **Substrate purpose**: Enable learning (not just audio capture). Audio is the entry point.
- **Stack**: React + Vite + Postgres + tRPC (team's existing expertise).
- **Architecture**: Monorepo with lens packages. Migrate to microfrontends via vite-plugin-federation when needed.
- **POC approach**: Frontend-only React app with sql.js as local database, TanStack Query for data access, spoofed fixtures. 1-2 weeks.
- **MVP**: Full stack with real audio recording (Capacitor), transcription, Postgres, and AI. 3-4 months.
