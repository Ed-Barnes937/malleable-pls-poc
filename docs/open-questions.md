# Malleable PLS - Open Questions

Questions to explore later. Add to this as they come up.

---

### Workspace scoping: user-defined vs inferred?

**Decided:** Scope is separated from arrangement. Workspaces define layout and lens config (changes rarely). Scope controls what data flows through (changes frequently — switching courses, time windows, etc.). Scope switching is a first-class, prominent interaction, not buried in settings. "Course" is a tag, not a core primitive. See terminology.md (Workspace), ux-concepts.md (Arrangement + Scope), technical-guidance.md (Workspace Config).

**Still open:** How is scope set?

- **Explicit**: User manually tags/organises material into scopes ("this is biology, this is chemistry") and workspaces filter by those tags. Clear but adds friction — the user has to do housekeeping.
- **Inferred**: The system observes what material the user works with in a workspace and infers the scope. "You've only opened biology lectures here, so I'll treat this as a biology workspace." Lower friction but potentially surprising — what if the system gets it wrong?
- **Hybrid?**: Start inferred, surface the inferred scope to the user, let them correct/pin it. But this introduces a new UX concept (visible inferred state) that needs careful design.

Remaining tensions:
- Explicit scoping is more predictable but adds cognitive overhead
- Inferred scoping is smoother but risks "why is this showing up here?" confusion
- Cross-cutting concerns (a lecture that covers both biology and chemistry) break clean scoping in either model
- How does scoping interact with sharing? If I share a workspace, does the scope transfer or does it re-infer for the new user?
- **Per-lens scope overrides** — should individual panels be able to narrow scope beyond the workspace level? e.g. a cross-course dashboard where one panel shows biology and another shows chemistry. Not needed for POC/MVP, but a natural layer-2 knob if users want it.

---

### Lens-local data that isn't anchored to core primitives

The `lens_data` model assumes lens-specific data is always attached to an existing core entity (an annotation, a recording, etc.). But what about lenses that need free-floating data?

- A **mind-map lens** might create groupings or spatial clusters that don't correspond to any recording or annotation
- A **planner lens** might need to store tasks, deadlines, and time blocks that have no anchor in the audio/transcript world at all

Does "group" or "task" become a core primitive? That feels like it violates scaling rule 2 (core types grow by ones, not by N). But if it's lens-local, other lenses can't see it — and you might *want* the review lens to know about upcoming deadlines.

Deeper question: **is a planner actually a lens at all?** It doesn't really "view" the data substrate through a different perspective — it introduces its own domain. It might be more of a **micro-app**: something that lives in a workspace alongside lenses, participates in the layout, but owns its own data and doesn't pretend to be a view over recordings/transcripts.

Key tensions:
- If we allow micro-apps, we need to define how they differ from lenses (do they still read/write to the substrate? can they be scoped?)
- If a planner micro-app can write tags or links to core primitives ("this recording is relevant to Thursday's exam"), it's partially a lens and partially its own thing — where's the boundary?
- Do micro-apps break the "lenses never talk to each other" rule, or can they participate in the same substrate-mediated indirect communication?
- How many things that look like lenses at first glance are actually micro-apps? (timers, pomodoro trackers, calendar views, goal setting)

---

### What are our core primitives, and what qualifies as one?

The substrate's purpose is to enable better learning (not just audio capture — audio is the entry point and initial data collection mechanism, but the platform serves the whole learning journey). That scope is deliberately broader than "things derived from recordings."

This means some primitives might have no direct relationship to audio at all — a study task, a learning goal, a knowledge gap. But if everything learning-related becomes a primitive, the set bloats and scaling rule 2 breaks down.

Need to define:
- **What makes something a primitive vs lens-local data?** A candidate test: "would multiple unrelated lenses benefit from reading/writing this type?" If yes, it's probably a primitive. If only one lens cares, it's lens-local.
- **How many is too many?** The original sketch had ~7. Is there a hard ceiling? Does it matter?
- **Who decides?** Adding a primitive is a platform-level decision that affects every lens. There needs to be a clear bar — this is the most consequential API decision in the system.
- **What's the lifecycle?** Can primitives be deprecated? What happens to lenses that depend on a removed type?
- **Does the learning-focused substrate scope change the original list?** The initial primitives (recording, transcript, annotation, tag, link, confidence signal, workspace) were audio-centric. A learning-first substrate might need things like "concept", "learning objective", or "study task" at the core level. But each addition has a cost.
