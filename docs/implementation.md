# Malleable PLS - Implementation

> See also: [terminology.md](terminology.md) for core concepts, [ux-concepts.md](ux-concepts.md) for user experience rationale, [technical-guidance.md](technical-guidance.md) for full stack options and architecture.

## POC: Sell the Vision

**Goal:** Put the malleable PLS in someone's hands for 5 minutes and have them go "oh, I get it."

**Timeline:** 1-2 weeks with a senior dev.

**Audience:** Internal stakeholders. This sells the concept, not the product.

### What to build

A single-page React app with hardcoded data. The data is fake but the architecture is real — lenses query a local database independently, write back to it, and react to each other's writes through query invalidation. This is the thing people can't get from a slide deck.

### POC Axioms

Properties that must hold for the demo to prove the concept. If any of these break, the architecture is wrong.

1. **Lens independence** — Every lens functions with no knowledge of which other lenses exist in the workspace. Removing any single lens from a workspace must not break or degrade any other lens.
2. **Substrate-mediated reactivity** — When one lens writes to the substrate, other lenses that query related data update automatically. No event bus, no pub/sub, no lens-to-lens channels. TanStack Query invalidation is the only mechanism.
3. **Two-layer state only** — Substrate (shared, persistent, all lenses read/write) and lens-local (`lens_data`, private to one lens type). No ephemeral global state layer. Workspace config is static layout and scope, not runtime mutable state.
4. **Workspaces are perspectives, not pages** — Switching workspaces changes lens selection and configuration. The underlying data doesn't change. The user sees different arrangements of tools over the same material.
5. **Real substrate** — sql.js, not React state. Lenses genuinely query a database independently. The query patterns, table shapes, and scoping logic carry forward to MVP.

### POC Assumptions

Working hypotheses we're testing. These may be wrong — that's the point of a POC.

1. **Audio capture and transcript viewing are separate lenses.** The audio capture lens writes Recordings to the substrate. A background job creates Transcript Segments. The transcript lens reads those segments and enables inline interaction (tagging, annotation, confusion markers, linking). These are independent concerns connected only through the substrate.
2. **The transcript lens is the right place for inline annotation.** A lens that reads transcript segments and lets you mark them up is one coherent tool — a "transcript viewer and annotator." It writes tags, annotations, and links to the substrate using the same hooks any lens uses. This is not SPA creep; a lens becomes an SPA when it handles multiple unrelated concerns (quizzing, reviewing, scheduling), not when it writes to the substrate.
3. **Lens config handles modal differences.** The same lens type can behave differently across workspaces via `workspace_panels.config`. A transcript lens in a capture-focused workspace shows minimal chrome with prominent tag buttons. In a review workspace it shows detailed segments with inline annotations. This is the layer-2 knobs model — not a reason to split into separate lens types.
4. **3-4 lenses are sufficient to demonstrate emergent behaviour.** Transcript, test-me, weekly review, and connections — each reading and writing different slices of the substrate — should produce enough cross-lens reactivity to sell the concept.
5. **Users understand the workspace metaphor without onboarding** when they see lens arrangement change and data flow through it.

### Data Flow Scenarios the POC Must Demonstrate

These describe substrate-level data flow, not specific UI interactions. How these render is a design decision, not an architectural one.

1. **Write-then-read across lenses** — The transcript lens writes a "confused" tag on a segment. The test-me lens, which queries tags to weight its questions, re-renders with that segment prioritised. The weekly review lens, which aggregates tags, updates its gap count. Neither lens knows the other exists.
2. **Confidence propagation** — The test-me lens writes a low confidence signal against a transcript segment. The weekly review lens reads confidence signals and adjusts its recommendations. The transcript lens reads confidence signals and can surface them inline alongside the segment.
3. **Workspace perspective shift** — The same underlying data (recordings, transcript segments, tags, confidence signals) is viewed through different workspace configurations. Switching from a capture-focused workspace to a review workspace changes which lenses are present and how they're configured, but no data moves.
4. **Lens independence proof** — Remove any single lens from a workspace. No other lens breaks. A workspace with only a transcript lens still functions. A workspace with only a review lens still functions (showing whatever data exists in the substrate, regardless of which lens wrote it).

### Stack

```
React + Vite
React Grid Layout (draggable panels)
sql.js (SQLite in WASM — local database, no server)
TanStack Query (data fetching/caching layer between lenses and sql.js)
Zustand (UI-only state — panel focus, expansion, local drafts)
Hardcoded JSON fixtures (seeded into sql.js on startup)
```

### Why sql.js instead of just React state?

A Zustand store or React Context would work, but it lets a sceptic dismiss the demo as "you just wired the components together." With sql.js:
- Lenses genuinely query a database independently — the shared substrate is real, not simulated
- The query patterns, table shapes, and scoping logic carry forward to the MVP
- The substrate API you build (thin wrapper over sql.js) becomes a real prototype, not a throwaway

Adds ~1 day of work. Worth it.

### State Management: What Lives Where

| Layer | Tool | Role | Example |
|-------|------|------|---------|
| Substrate data | sql.js | Source of truth. Core primitives + lens data. | Annotations, tags, confidence signals |
| Data access | TanStack Query | Fetching, caching, invalidation. Sits between lenses and sql.js. | `useQuery(['annotations', scope])` |
| UI state | Zustand | Client-only, ephemeral. No substrate involvement. | Which panel is focused, is a lens expanded, draft text in an input |

### How Lenses Read, Write, and React to Each Other

Three layers: **lenses → substrate hooks → db adapter**. Lenses never touch sql.js directly.

**Substrate hooks** (shared by all lenses):

```typescript
// packages/substrate/src/hooks.ts

// Reading
function useAnnotations(scope: Scope) {
  return useQuery(['annotations', scope], () => db.getAnnotations(scope))
}

function useConfidenceSignals(scope: Scope) {
  return useQuery(['confidence_signals', scope], () => db.getConfidenceSignals(scope))
}

// Writing — onSuccess invalidates related queries, triggering re-renders in other lenses
function useCreateTag() {
  const queryClient = useQueryClient()
  return useMutation(
    (tag: NewTag) => db.createTag(tag),
    { onSuccess: () => queryClient.invalidateQueries(['tags']) }
  )
}

function useRecordConfidence() {
  const queryClient = useQueryClient()
  return useMutation(
    (signal: NewConfidenceSignal) => db.createConfidenceSignal(signal),
    { onSuccess: () => queryClient.invalidateQueries(['confidence_signals']) }
  )
}
```

**A lens uses these hooks** — never the db layer directly:

```typescript
// packages/lens-flashcard/src/FlashcardLens.tsx

function FlashcardLens({ scope, config }: LensProps) {
  const { data: annotations } = useAnnotations(scope)
  const { data: confidence } = useConfidenceSignals(scope)
  const recordConfidence = useRecordConfidence()

  function handleAnswer(annotationId: string, score: number) {
    recordConfidence.mutate({
      target_type: 'annotation',
      target_id: annotationId,
      score,
      source_lens_id: 'flashcard',
    })
  }

  return (/* render flashcards */)
}
```

**Cross-lens reactivity** works via TanStack Query's invalidation — no custom event bus:

```
1. User marks "confused" in transcript lens
2. Transcript lens calls useMutation → writes tag to sql.js
3. onSuccess invalidates ['tags'] queries
4. Weekly overview and test-me lenses re-fetch and re-render
```

Lenses don't know about each other. They declare data dependencies as query keys.

**The db adapter** is the only layer that changes between POC and MVP:

```typescript
// packages/substrate/src/db.ts

// POC: sql.js
const db = {
  getAnnotations: (scope) =>
    sqljs.exec(`SELECT * FROM annotations WHERE ...scope filters...`),
  createTag: (tag) =>
    sqljs.exec(`INSERT INTO tags (...) VALUES (?, ?, ?)`,
      [tag.target_type, tag.target_id, tag.label]),
}

// MVP: swap to tRPC — hooks and lenses stay identical
const db = {
  getAnnotations: (scope) => trpc.annotations.list.query(scope),
  createTag: (tag) => trpc.tags.create.mutate(tag),
}
```

### Spoofed data set

One fictional student, two courses (biology, chemistry), ~5 pre-built recordings with transcripts, annotations, tags, and confidence signals. Seeded into sql.js tables on startup. Enough to show cross-lecture connections and weekly trends.

### What to skip

- No backend, no auth
- No audio recording or transcription — spoofed transcript with fake timestamps
- No AI — hardcoded quiz questions and connections
- No real persistence across sessions — sql.js reseeds on refresh (or persist to localStorage/OPFS if cheap)
- No collaboration/sharing
- No mobile/Capacitor
- No customisation (gentle slope layer 2/3) — just the layer 1 defaults

### What it proves

- The workspace/lens model is tangible, not just a slide
- Cross-lens data reactivity works and feels magical
- "It's a workbench, not a guided tour" lands viscerally
- People can see themselves in the student's shoes

### What it doesn't prove

- Technical feasibility of the substrate, sync, or audio pipeline
- That the gentle slope works (customisation isn't in the POC)
- That community/sharing dynamics work
- Performance at scale

---

## MVP: Prove the Value

**Goal:** A real student uses this for a real course for one semester and learns better with it than without it.

**Timeline:** 3-4 months with a small team (2-3 devs).

**Audience:** Real students. This proves the value, not just the concept.

### What to build (on top of POC)

| Concern | What's needed |
|---------|---------------|
| Audio recording | Capacitor mobile app with native recording. The entry point — without it there's no data. |
| Transcription | Hosted service (Deepgram/AssemblyAI). Real transcripts from real lectures. |
| Data substrate | Postgres + tRPC. Real persistence, real queries, the schema from technical-guidance.md. |
| Auth | Clerk or Auth.js. Students have accounts. |
| First-party lenses (3-4) | Transcript viewer, flashcard/test-me, weekly review, connections. POC lenses made real — backed by actual data, with basic layer 2 knobs. |
| Basic AI | LLM-generated quiz questions and summaries. RAG over student's own recordings via pgvector. |
| Sync | Cross-device. Record on phone, review on laptop. |
| Offline reads | Local SQLite cache for reviewing without internet. |

### What to still skip

- Community lenses / marketplace
- Institutional features (analytics dashboard, LMS integration, SSO)
- Collaboration / shared workspaces
- Microfrontends — monorepo is fine
- Full gentle slope (layer 3: fork and modify)
- Planner and other micro-app lenses

### What it proves

- Students actually use this with real lecture data
- The substrate model works technically
- Cross-lens reactivity is valuable with real data, not just cool with spoofed data
- Audio → transcript → annotation → quiz pipeline works end-to-end
- Retention/engagement data to support institutional sales conversations

---

## POC vs MVP Boundary

```
POC                              MVP
─────────────────────────────    ─────────────────────────────
Spoofed data in sql.js           Real audio + transcription
TanStack Query → sql.js          TanStack Query → tRPC → Postgres
Frontend only                    Full stack
1-2 weeks                        3-4 months
Proves the concept               Proves the value
Audience: stakeholders           Audience: real students
"I get it"                       "I use it"
```

### What carries over from POC to MVP

The POC is a throwaway in terms of transport, but not components:
- Lens components become monorepo packages
- Grid layout becomes the workspace shell
- sql.js schemas map directly to Postgres schemas
- Substrate hooks and Zustand stores carry over unchanged
- Only the db adapter swaps (sql.js → tRPC)
- Spoofed fixtures become test data
