# Malleable PLS - Technical Guidance

> See also: [terminology.md](terminology.md) for core concepts and scaling rules, [implementation.md](implementation.md) for POC/MVP build spec, [technical-constraints.md](technical-constraints.md) for mobile/browser limitations.

Architectural sketches, schemas, and stack options captured during ideation.

---

## Data Substrate Schema (rough)

### Core Primitives

```sql
recordings
  id, created_at, duration, audio_url, status (transcribing|ready)

transcript_segments
  id, recording_id, start_ms, end_ms, text, speaker

annotations
  id, anchor_type (recording|transcript_segment|annotation), anchor_id,
  anchor_start_ms?, anchor_end_ms?,
  body, created_at, author_id

tags
  id, target_type, target_id, label, created_at

links
  id, source_type, source_id, target_type, target_id, relationship?

confidence_signals
  id, target_type, target_id, score, source_lens_id,
  created_at, decay_curve?
```

Note: this primitive list is audio-centric. A learning-first substrate may need additional primitives (see open-questions.md).

### Lens-Local Data

Single generic table. Lens-specific data stored as opaque JSON. Can be anchored to a core primitive or free-floating.

```sql
lens_data
  id, lens_type,
  target_type (nullable), target_id (nullable),
  data (jsonb)

-- Anchored (flashcard schedule on an annotation):
-- lens_type: "flashcard", target_type: "annotation", target_id: 42
-- data: {"next_review": "2026-04-20", "interval": 3, "ease": 2.5}

-- Free-floating (planner task, no anchor):
-- lens_type: "planner", target_type: null, target_id: null
-- data: {"title": "Review mitochondria", "due": "2026-04-18"}

-- Hybrid (planner task linked to a recording):
-- lens_type: "planner", target_type: "recording", target_id: 7
-- data: {"title": "Re-listen to intro section", "due": "2026-04-18"}
```

### Workspace Config

A workspace separates **overlays** (panels, layout, lens config — the glasses, changes rarely) from **scope** (what data flows through — what you're looking at, changes frequently). Switching course within a workspace updates scope, not overlays.

```sql
workspaces
  id, name, owner_id, created_at

workspace_panels
  id, workspace_id, lens_type,
  position (jsonb),    -- layout info, intentionally flexible
  config (jsonb),      -- lens-specific settings for THIS panel instance
  created_at

workspace_scopes
  id, workspace_id, scope_type, scope_value
  -- scope_type: "tag" | "timeframe" | "recording" | "exclude"
  -- scope_value: "biology" | "2026-semester-1" | "rec_123" | "tag:practice-only"
  -- Scope is the user's primary dial. Changing scope is frequent and low-friction.
  -- A workspace with no scope rows sees all data (widest aperture).
```

---

## Architecture Overview

Lenses never communicate directly — all interaction is emergent through the shared substrate (see terminology.md for principles and scaling rules).

### Lens–Substrate–Workspace Relationship

```
┌─ Workspace ──────────────────────────────────────────┐
│  scope: [tag=biology, time=last_7d]                  │
│                                                       │
│  ┌─ Panel ──────────┐    ┌─ Panel ──────────┐        │
│  │ lens: transcript  │    │ lens: flashcard   │        │
│  │ config: {...}     │    │ config: {...}     │        │
│  │                   │    │                   │        │
│  │ reads: segments,  │    │ reads: annotations│        │
│  │   annotations,    │    │   tags, confidence│        │
│  │   tags            │    │ writes: confidence│        │
│  │ writes:           │    │   lens_data       │        │
│  │   annotations     │    │                   │        │
│  └───────────────────┘    └───────────────────┘        │
│                                                       │
│          ┌────────────────────────┐                   │
│          │   Data Substrate       │                   │
│          │   (filtered by scope)  │                   │
│          └────────────────────────┘                   │
└───────────────────────────────────────────────────────┘
```

### Lens Spectrum

Lenses exist on a spectrum from pure substrate views to mostly self-contained:

```
Pure lens ◄─────────────────────────────► Pure micro-app

Flashcards        Review        Planner        Pomodoro
100% substrate    90/10         30/70          5/95
0% local data                                  local data
```

All use the same lens_data table and workspace_panels config. The platform doesn't distinguish — the ratio of substrate vs local data is an implementation detail of each lens.

---

## Tech Stack: Two Approaches

The team's core expertise is **React + Postgres**. There are two viable approaches to building the platform, sitting at different points on a spectrum:

```
Traditional SPA            Pragmatic Middle Ground       Full Local-First
(React + Postgres)         (React + Postgres +           (React + cr-sqlite +
                            local cache/sync)              CRDT sync server)

Current expertise ────────► Recommended start ───────────► Long-term aspiration
```

---

### Approach A: Pragmatic Middle Ground (Recommended Start)

Server-authoritative Postgres with a local persistence layer for offline use and fast UI. The team can start building immediately with known tech.

#### Stack

**Frontend**

| Concern | Tech | Why |
|---------|------|-----|
| UI framework | React | Known. Lens = React component. |
| State/sync | TanStack Query (React Query) | Server state sync with local caching, offline mutations, optimistic updates. 80% of "feels local-first" UX without CRDTs. |
| Local persistence | OPFS + wa-sqlite (browser), native SQLite (Capacitor) | In-browser SQLite for offline reads. Mirrors subset of Postgres locally. |
| Workspace layout | React Grid Layout or similar | Draggable, resizable panels. Maps to workspace_panels model. |
| Lens runtime | React components + context boundary | Each lens receives a data API and config via props/context. Sandboxed by convention initially, by iframe later for community lenses. |

**Backend**

| Concern | Tech | Why |
|---------|------|-----|
| Database | Postgres | Known. Schemas map directly. JSONB for lens_data and config. |
| API | tRPC | All-TypeScript, end-to-end type safety. Faster to build than GraphQL. |
| Realtime | WebSockets (tRPC subscriptions) | Collaboration on shared workspaces. Postgres LISTEN/NOTIFY can drive this. |
| Auth | Auth.js or Clerk | Student login, institutional SSO later. Don't build this. |
| File storage | S3-compatible (Cloudflare R2) | Audio blobs. R2 has no egress fees — important when students download their own recordings. |
| Embeddings | pgvector (Postgres extension) | Vector search stays in Postgres. No separate vector DB. |

**Audio Pipeline**

| Concern | Tech | Why |
|---------|------|-----|
| Transcription | Deepgram or AssemblyAI (hosted) | Start hosted, self-host Whisper later at scale. |
| Speaker diarization | Bundled with transcription service | Lecturer vs student identification. |
| Semantic chunking | Custom + LLM | Topic boundary detection over transcript. |
| Embeddings | OpenAI embeddings or local model | Stored in pgvector. |

**AI Layer**

| Concern | Tech | Why |
|---------|------|-----|
| LLM | Claude API or OpenAI | Quiz generation, summarisation, gap analysis. Abstracted behind a service for provider swapping. |
| RAG | pgvector + custom retrieval | Student's embeddings in Postgres. Vector similarity + LLM synthesis. |
| Job queue | Inngest or BullMQ | Async transcription, embedding, AI processing. Inngest is event-driven with retries. |

**Infrastructure**

| Concern | Tech | Why |
|---------|------|-----|
| Hosting | Vercel (frontend) + Railway/Fly.io (backend) | Simple early. Single deployment on Railway/Fly also viable. |
| Mobile | Capacitor | Team has experience. Native audio + file system. |
| Desktop | PWA initially | Add Tauri later if desktop recording matters. |

#### Architecture Diagram

```
┌─ Client (React) ─────────────────────────────────────┐
│                                                       │
│  ┌─ Workspace Shell ──────────────────────────────┐  │
│  │  Layout engine (React Grid Layout)              │  │
│  │                                                  │  │
│  │  ┌─ Lens ─────┐  ┌─ Lens ─────┐  ┌─ Lens ──┐  │  │
│  │  │ React comp  │  │ React comp  │  │ React   │  │  │
│  │  │ ↕ data API  │  │ ↕ data API  │  │ ↕ data  │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─ Data Layer ───────────────────────────────────┐  │
│  │  TanStack Query (server sync + cache)           │  │
│  │  Local SQLite (offline reads)                    │  │
│  │  Optimistic mutations                            │  │
│  └──────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
          │ tRPC / WebSocket
          ▼
┌─ Server ──────────────────────────────────────────────┐
│  tRPC API                                              │
│  ├── Workspace/panel/scope CRUD                        │
│  ├── Primitive CRUD (recordings, annotations, etc.)    │
│  ├── Lens data read/write                              │
│  ├── Scoped queries (apply workspace filters)          │
│  └── Realtime subscriptions (collaboration)            │
│                                                        │
│  ┌─ Postgres ─────────────┐  ┌─ S3/R2 ────────────┐  │
│  │ Core primitives         │  │ Audio blobs         │  │
│  │ Lens data (JSONB)       │  │                     │  │
│  │ Workspace config        │  │                     │  │
│  │ pgvector (embeddings)   │  │                     │  │
│  └─────────────────────────┘  └─────────────────────┘  │
│                                                        │
│  ┌─ Job Queue (Inngest) ─────────────────────────┐    │
│  │ Transcription → Embedding → AI processing      │    │
│  └────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────┘
```

#### Pros
- Team can start building immediately — React, Postgres, tRPC are all known
- Battle-tested tooling with massive ecosystems
- pgvector keeps AI/vector search in Postgres — no extra infrastructure
- Standard deployment model (Vercel/Railway) with known operational patterns
- Easier to reason about data consistency (server is authoritative)
- Institutional customers may actually prefer server-side data (backups, admin, compliance)

#### Cons
- Offline writes are harder — optimistic mutations + conflict resolution on reconnect, not automatic CRDT merge
- Collaboration is server-mediated, not peer-to-peer — shared workspaces feel slightly less instant
- Server dependency — no internet = degraded experience (can read from local cache, but can't write safely)
- If institutions later demand "data stays on device", significant rearchitecting needed
- The "your data is yours" story is weaker — it lives on the server, not the student's machine

---

### Approach B: Full Local-First

The client is the source of truth. Data lives on the student's device, syncs via CRDTs. The server is a thin relay, not an authority.

#### Stack

Shares React, React Grid Layout, Capacitor, and the audio/AI pipeline with Approach A. The differences:

**Frontend — what changes**

| Concern | Tech | Why |
|---------|------|-----|
| Data layer | cr-sqlite or Automerge | Replaces TanStack Query + server sync. cr-sqlite gives SQL queries over CRDT data. Automerge gives richer document-level merging. |
| Local storage | SQLite (cr-sqlite) or IndexedDB (Automerge) | Data lives here first. This IS the database — not a cache. |

**Backend — much thinner**

| Concern | Tech | Why |
|---------|------|-----|
| Sync server | WebSocket relay | Passes CRDT operations between peers. Doesn't understand the data — just bytes. |
| Auth | Auth.js or Clerk | |
| File storage | S3/R2 | Audio blobs still need server-side storage. |
| Persistence backup | Optional Postgres or S3 | Can persist CRDT state for backup/recovery, but it's not authoritative. |

Audio pipeline and AI layer are identical to Approach A — server-side processing jobs regardless of where the data lives. Results get written back as CRDT operations.

#### Architecture Diagram

```
┌─ Client (React) ─────────────────────────────────────┐
│                                                       │
│  ┌─ Workspace Shell ──────────────────────────────┐  │
│  │  Layout engine                                   │  │
│  │  ┌─ Lens ─────┐  ┌─ Lens ─────┐  ┌─ Lens ──┐  │  │
│  │  │ React comp  │  │ React comp  │  │ React   │  │  │
│  │  │ ↕ data API  │  │ ↕ data API  │  │ ↕ data  │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─ cr-sqlite / Automerge ────────────────────────┐  │
│  │  THIS IS THE DATABASE                            │  │
│  │  Full substrate lives here                       │  │
│  │  Offline reads AND writes, always                │  │
│  │  CRDT merge on reconnect — no conflicts          │  │
│  └──────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
          │ CRDT sync (WebSocket)
          ▼
┌─ Sync Server (thin) ─────────────────────────────────┐
│  WebSocket relay (passes CRDT ops between peers)      │
│  Optional: persist CRDT state for backup              │
│  Auth                                                  │
│                                                        │
│  ┌─ S3/R2 ────────────┐                               │
│  │ Audio blobs          │                               │
│  └──────────────────────┘                               │
│                                                        │
│  ┌─ Processing Workers ──────────────────────────┐    │
│  │ Transcription → Embedding → AI processing      │    │
│  │ (reads audio from S3, writes results as CRDT   │    │
│  │  operations back to the user's document)        │    │
│  └────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────┘
```

#### Pros
- True offline — reads AND writes work with no internet. Students in lecture halls with no wifi are first-class citizens.
- Collaboration is peer-to-peer via CRDTs — real-time shared workspaces merge automatically, no conflict resolution logic to write
- "Your data is yours" is literally true — it lives on your device. Strong privacy and ownership story.
- Server is cheap and simple — just a relay, no complex API layer
- Sharing workspaces/lenses is natural — they're just CRDT documents you replicate
- Aligns perfectly with malleable software philosophy (Ink & Switch built Automerge for exactly this)
- Institutional "data on device" requirements are met by default

#### Cons
- **Significant learning curve** — CRDTs are a different mental model. The team has no experience here. Debugging sync issues is harder than debugging API calls.
- **cr-sqlite is young** — Less battle-tested than Postgres. Fewer tools, smaller community, rougher edges.
- **Automerge trade-off** — If you go Automerge instead of cr-sqlite, you lose SQL queries. Lenses would need a different query pattern.
- **Vector search is harder** — No pgvector equivalent on the client. Either run embedding queries server-side (defeating some of the local-first benefit) or ship a client-side vector search lib.
- **Audio blobs still need a server** — CRDTs sync structured data well, but large audio files still need S3. So you're not truly serverless.
- **Aggregate analytics for institutions is harder** — Data lives on student devices. Building the anonymised dashboard means students opt-in to sending aggregate signals to a server. More complex than querying Postgres.
- **Operational unfamiliarity** — When something goes wrong with sync, the team is in new territory. Postgres problems have Stack Overflow answers. CRDT sync bugs may not.

---

### Comparison Summary

| Concern | Pragmatic (A) | Local-First (B) |
|---------|---------------|------------------|
| Team readiness | Start tomorrow | 2-3 month ramp-up |
| Offline reads | Yes (local cache) | Yes (native) |
| Offline writes | Optimistic, needs conflict handling | Automatic CRDT merge |
| Collaboration | Server-mediated | Peer-to-peer CRDT sync |
| Data ownership | Server-side | Device-side |
| Vector search (AI) | pgvector in Postgres | Needs server round-trip or client-side lib |
| Institutional analytics | Query Postgres directly | Requires opt-in data aggregation |
| Server complexity | Full API + DB | Thin relay |
| Client complexity | Standard React | React + CRDT data layer |
| Debugging | Familiar tooling | New territory |
| Maturity of stack | Battle-tested | Emerging (cr-sqlite, Automerge) |
| Migration path | Can evolve toward B later | Already there |
| Philosophy alignment | Partial | Full (Ink & Switch approach) |

### Recommendation

Start with **Approach A**. The data model and lens architecture are identical in both — the difference is transport and storage. Build the product, prove the value, learn what collaboration patterns actually matter to students. If true local-first becomes a requirement (institutional demand, offline-heavy use cases, or the CRDT ecosystem matures), the migration is a storage/sync layer swap, not a rewrite.

The schemas we've designed work in both worlds. That's deliberate.

---

## Frontend Architecture: Monorepo vs Microfrontends

### Why This Question Matters

Lenses are self-contained by design — they don't talk to each other, they have a defined data API, and they could theoretically be built by different teams or community contributors. This naturally raises the question: should each lens be a separately deployed microfrontend?

### Microfrontends: Pros & Cons

**Pros:**
- Independent deployment — ship a lens update without redeploying everything
- Team autonomy — different teams own different lenses with their own release cycles
- Technology flexibility — community lenses could use Svelte, Vue, etc.
- Natural boundary — lenses are already architecturally isolated

**Cons:**
- Organisational overhead for a small team — microfrontends solve a scaling problem you don't have yet with 2-5 frontend devs
- Shared state complexity — lenses need to know about substrate changes in real-time, requiring cross-microfrontend eventing
- Bundle size — each microfrontend potentially ships its own React copy. Shared dependencies need careful management.
- UX consistency — different bundles can drift in look-and-feel
- Developer experience — local dev means orchestrating multiple microfrontends, a shell app, and the data layer

### Recommendation: Monorepo With Strong Module Boundaries

The right starting point is a monorepo where each lens is its own package. You get architectural isolation without operational overhead.

```
Monolith           Monorepo + Packages       Microfrontends
(one big app)      (one deploy, many          (many deploys,
                    packages with clean        runtime composition)
                    boundaries)

Too coupled ──────► Start here ──────────────► Migrate when needed
```

#### Suggested Structure (Vite + pnpm/turborepo)

```
monorepo/
  packages/
    substrate/          -- data layer, shared types, tRPC hooks
    workspace-shell/    -- layout engine, panel management, scoping
    lens-transcript/    -- transcript lens
    lens-flashcard/     -- flashcard lens
    lens-review/        -- review lens
    lens-planner/       -- planner lens
    shared-ui/          -- design system, common components
  apps/
    web/                -- Vite app, assembles everything, single deploy
    mobile/             -- Capacitor shell
```

Each lens package:
- Imports from `substrate` and `shared-ui` only
- Never imports from another lens (package boundary enforces this)
- Exports a React component + LensManifest
- Has its own tests

The `web` app imports all lens packages and registers them with the workspace shell. Single Vite build, single deploy.

#### What This Gets You
- **Isolation without overhead** — lens boundaries are enforced by package structure, not infrastructure
- **Fast builds** — Vite + turborepo caches per-package. Changing one lens only rebuilds that package.
- **Clear contracts** — the `substrate` package IS the API contract. If a lens compiles against it, it works.
- **Easy onboarding** — "go to packages/lens-flashcard, here's the data API, build your component"
- **Migration-ready** — when you need microfrontends, each package is already a self-contained unit

### When to Migrate to Microfrontends

Three triggers:
1. **Community/third-party lenses** — external developers can't commit to your monorepo
2. **Multiple teams (3+) with deployment contention** — coordinating releases becomes a bottleneck
3. **Institutional private lenses** — organisations want lenses that never touch your codebase

See "Migration: Monorepo to Microfrontends" section below for the Vite-based migration path.

---

## Migration: Monorepo to Microfrontends (Vite)

The team uses Vite, not webpack — so Module Federation (webpack's approach) is not the path. Here's what the migration looks like with Vite-native tooling.

### The Key Concept: Vite Plugin Federation

**vite-plugin-federation** implements Module Federation for Vite. It allows one Vite app (the "host") to dynamically import modules from other independently deployed Vite apps ("remotes") at runtime.

### What Changes, What Doesn't

| Concern | Monorepo (now) | Microfrontends (later) |
|---------|----------------|------------------------|
| Lens code | Package in monorepo | Separately deployed Vite app |
| How the shell loads a lens | Static import at build time | Dynamic import via federation at runtime |
| Data API (substrate) | Direct package import | Published as an npm package, consumed by remote lenses |
| Shared UI | Direct package import | Published as npm package OR shared via federation |
| React | Single copy in bundle | Shared singleton via federation config |
| Deploy | One build, one deploy | Shell + each lens deployed independently |
| First-party lenses | Still in monorepo (can be both) | Can stay in monorepo AND be federated |

### Migration Steps

**Phase 1: Prepare (do this now, in the monorepo)**

The most important thing: make sure the boundary between the workspace shell and each lens is **a clean dynamic import**, not a static wiring.

```typescript
// Instead of this (static, tightly coupled):
import { FlashcardLens } from '@pls/lens-flashcard'

// Do this (dynamic, registry-based):
const lensRegistry = {
  flashcard: () => import('@pls/lens-flashcard'),
  transcript: () => import('@pls/lens-transcript'),
  review: () => import('@pls/lens-review'),
}
```

This costs nothing now and is the exact seam you'll split on later. The workspace shell already doesn't know what's inside a lens — it just loads a component from the registry.

Also: publish `substrate` and `shared-ui` as internal npm packages (or use a private registry). In the monorepo these are just workspace dependencies. When external lenses appear, they need to install them from somewhere.

**Phase 2: Federation (when triggered)**

When a community lens or institutional lens needs to be loaded at runtime:

```typescript
// vite.config.ts — host (workspace shell)
import federation from '@originjs/vite-plugin-federation'

export default defineConfig({
  plugins: [
    federation({
      remotes: {
        // First-party lenses can still be local OR federated
        'lens-flashcard': 'https://lenses.yourcdn.com/flashcard/assets/remoteEntry.js',
        // Community lens loaded from their deployment
        'lens-clinical-case': 'https://community-lenses.example.com/clinical-case/remoteEntry.js',
      },
      shared: ['react', 'react-dom', '@pls/substrate', '@pls/shared-ui']
    })
  ]
})
```

```typescript
// vite.config.ts — remote (a lens, deployed independently)
import federation from '@originjs/vite-plugin-federation'

export default defineConfig({
  plugins: [
    federation({
      name: 'lens-clinical-case',
      filename: 'remoteEntry.js',
      exposes: {
        './Lens': './src/ClinicalCaseLens.tsx',
        './manifest': './src/manifest.ts',
      },
      shared: ['react', 'react-dom', '@pls/substrate', '@pls/shared-ui']
    })
  ]
})
```

The `shared` config ensures React and the substrate SDK are singletons — not duplicated per lens.

**Phase 3: Dynamic Lens Registry**

The lens registry evolves from a static map to a dynamic loader:

```typescript
// Before (monorepo): static imports
const lensRegistry = {
  flashcard: () => import('@pls/lens-flashcard'),
}

// After (federation): mix of local and remote
const lensRegistry = {
  // First-party, still in monorepo
  flashcard: () => import('@pls/lens-flashcard'),
  // Federated community lens
  'clinical-case': () => import('lens-clinical-case/Lens'),
}

// Eventually: fully dynamic, loaded from a lens catalogue API
async function loadLens(lensId: string) {
  const entry = await fetch(`/api/lenses/${lensId}`).then(r => r.json())
  // entry = { remoteUrl: 'https://...', moduleName: './Lens' }
  const container = await loadRemoteModule(entry.remoteUrl)
  return container.get('./Lens')
}
```

### Sandboxing Community Lenses

Once external code is running in your app, security matters:

- **iframe sandbox** — Each community lens renders in an iframe. Communicates with the shell via postMessage. Strong isolation but harder to share React context and design tokens.
- **Shadow DOM + CSP** — Lighter isolation. Lens renders in shadow DOM with a strict Content Security Policy. Less secure than iframe but better UX integration.
- **Code review / signing** — Require community lenses to be reviewed and signed before appearing in the catalogue. Like an app store review process.

Recommended: **iframe for untrusted community lenses, direct federation for institutional/verified lenses.**

### What Makes This Migration Smooth

The reason this isn't a rewrite:

1. **Lenses are already isolated** — they only import from `substrate` and `shared-ui`. No lens-to-lens dependencies.
2. **The dynamic import pattern is already in place** — you just change where the import resolves to.
3. **The data contract (`substrate`) is unchanged** — a federated lens uses the exact same API as a monorepo lens.
4. **You can migrate one lens at a time** — keep most lenses in the monorepo, federate only the ones that need it. They coexist.

### Alternatives to vite-plugin-federation

- **Import maps** — Browser-native module loading. No build plugin needed. You publish each lens as an ES module, and the import map tells the browser where to find it. Simpler than federation but less control over shared dependencies.
- **Module Federation 2.0 (rspack)** — If you ever move to rspack (Rust-based, Vite-compatible), it has first-class Module Federation. But switching bundlers is a bigger decision.
- **Native ESM + service worker** — A service worker intercepts lens imports and resolves them dynamically. Experimental but interesting for the "install a lens from a link" UX.

---

## Lens Component Model (to be explored)

How a lens declares its capabilities, data dependencies, and config schema. Rough sketch:

```
LensManifest {
  type: string                    -- "flashcard", "review", "planner"
  reads: DataType[]               -- what core primitives it consumes
  writes: DataType[]              -- what core primitives it produces
  configSchema: JSONSchema        -- what settings it exposes (layer 2)
  minSize: {w, h}                 -- minimum panel dimensions
  description: string
}
```

The platform uses this manifest to:
- Apply workspace scope filtering before the lens sees data
- Show affordances (which lenses light up for current material)
- Render the layer 2 config UI from the schema
- Validate that a lens isn't writing types it didn't declare
