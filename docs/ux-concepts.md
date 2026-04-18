# Malleable PLS - UX Concepts

> See also: [terminology.md](terminology.md) for definitions, [implementation.md](implementation.md) for POC wireframes and build spec.

## Starting Point: Why Not Multiple Small Apps?

The previous thinking was to build multiple small apps each with a single focus (note taker, quiz generator, planner, etc.). The malleable PLS approach departs from this because even well-focused small apps create:
- **Data silos** — the quiz app has to import from the note-taker, the planner doesn't know quiz results
- **Fixed workflows** — you've decided for the learner that notes, quizzes, and planning are separate activities
- **No emergent behaviour** — a student can't invent a workflow you didn't anticipate

The malleable approach replaces "multiple apps" with "one substrate, many lenses."

---

## What The User Sees

There is no "app" in the traditional sense. The user opens **their workspace** — more like a desk than an application. On this desk are their **materials** (recordings, notes, highlights) and their **tools** (lenses). The materials are the primary objects, not the tools.

### Concrete Walkthrough: Priya's Biology Lecture

**Right after class** — She opens her workspace. The new recording is there, transcript appearing in the background. She skims and highlights a section on mitochondrial DNA she didn't follow. That highlight becomes data in the substrate: a timestamp, a "confused" tag, a link to that audio moment.

**That evening** — Her "Evening Review" workspace shows today's materials. She has a "test me" lens next to the transcript. It generates questions weighted toward her confusion markers. She's not in a separate quiz app — the quiz is right there, reading the same data as the transcript.

**She gets a question wrong** — The quiz lens writes a "weak spot" marker linked to that transcript segment. She clicks it and hears the original 40 seconds. She adds an annotation: "oh, maternal inheritance — not the same as mitochondrial mutation." That annotation joins the substrate too.

**She wants a study plan** — A "weekly review" lens reads all her weak spots and quiz results across all lectures. It shows: "3 shaky areas in biology, 1 in chemistry. Here's a 45-minute review session." She tweaks it to 30 minutes.

**Her friend Marco messages** — "How are you revising mitochondria?" She shares not just notes, but her arrangement: transcript + annotations + quiz lens + review lens. Marco opens it, keeps the notes, swaps the quiz for a flashcard lens he prefers. Both lenses read the same underlying material.

### SPA Mental Model vs Malleable PLS

| SPA world | Malleable PLS world |
|-----------|---------------------|
| User navigates to Quiz App | User applies a quiz lens to their material |
| Quiz app fetches from an API | Quiz lens reads shared local data directly |
| Quiz results live in the quiz app's DB | Quiz results written back to the same substrate |
| Sharing = "here's a link to my quiz" | Sharing = "here's my whole setup, take what you want" |
| New feature = new release | New lens = user drags it in, or someone shares one |
| User switches between apps | User arranges tools around their materials |

### The Engineering Mental Model Shift

Stop thinking about **screens**, start thinking about **surfaces and data**.

SPA thinking: "What does the quiz page look like? What API endpoints? What state does it manage?"

Malleable thinking: "What data does a quiz lens read? What does it write back? How big is its UI footprint? Can it sit next to other lenses?"

Each lens is like a self-contained web component that:
- Declares what data types it cares about
- Subscribes to changes reactively
- Renders in whatever space it's given
- Writes results back to the shared substrate
- Knows nothing about other lenses

---

## Workspaces: Smart Glasses, Not Rooms

A workspace is a pair of smart glasses. Each pair gives you different overlays — Iron Man-style HUD elements suited to a particular activity. What you're *looking at* is independent of which glasses you're wearing.

Two independent concerns:

- **Overlays** (arrangement) — which lenses, how they're configured, how they're laid out. These are the HUD elements on the glasses. They change rarely and intentionally.
- **Scope** (what you're looking at) — which course, time period, topic, specific recordings flow through those overlays. This changes frequently and should be low-friction.

Users have a few pairs of glasses (In Lecture, Evening Review, Exam Prep) and look at different material by switching scope. Put on your "Evening Review" glasses and look at biology — the transcript shows a biology lecture, the test-me lens generates biology questions, the review lens shows biology gaps. Look at chemistry instead — every overlay updates, but the glasses don't change.

This means users don't need glasses per course. One "In Lecture" pair works for all courses. One "Evening Review" pair works for all courses. Scope is what you point the glasses at, not a property of the glasses themselves.

### Example Glasses

**"In Lecture"** — Minimal overlays. Audio capture lens + transcript lens configured for capture mode (prominent tag buttons, minimal transcript chrome). Low friction, doesn't distract from listening.

**"Evening Review"** — Rich overlays. Transcript, test-me lens, connections, weekly overview. Where deep processing happens.

**"Exam Prep"** — Wide-angle overlays. Spaced repetition, gap analysis over months, timed practice conditions. Same glasses work whether scoped to one course or all courses — wider scope just means the overlays have more data to work with.

**"Study Group"** — Shared glasses. Collaborative annotations, discussion threads, confidence maps. Multiple people wearing the same overlays, each looking at shared material.

### Scope: What You're Looking At

Changing scope should feel like turning your head, not changing glasses. It's the most frequent thing a user does within a workspace — "show me biology," "show me this week," "show me everything." This is not buried in settings. It's prominent, always visible, and fast.

No scope filter = looking at everything. Scope of "biology + last 7 days" = looking at a focused slice. The overlays don't change either way — scope just controls what they're pointed at.

### Workspaces Are Live

Opening "Evening Review" on Thursday doesn't look like Monday. The weekly overview has updated. New confusion markers from today appear. The "test me" lens has refreshed based on yesterday's results. **The arrangement is stable. The data flowing through it is always current.**

### How Workspaces Are Created

- **Starter templates** — The system ships a few ("In Lecture", "Review Session", "Exam Prep"). Most users start here
- **Organic evolution** — User tweaks a template over time. No "save configuration" — it just remembers
- **Snapshot and fork** — "I like my review setup but want a variation for group study." Duplicate, modify
- **Share a workspace** — "Here's my exam prep glasses." Someone else puts them on and sees their own data through your overlays. The scope may transfer or be replaced by the new user's own material.

### Navigation

Not a settings page or dropdown. Tabs, or spatial zoom (zoom out to see all workspaces as thumbnails, zoom into one), or a simple switcher. The interaction is trivial — the power is in what's behind it.

---

## Lens Affordances: What Lights Up?

Lenses declare what data they find useful, not what they require. The user sees this as natural affordances:

- **Lenses that light up** — When looking at a well-annotated lecture, flashcard/test-me/summary lenses look ready. Suggested, prominent, inviting.
- **Lenses that dim** — Connections lens is muted when there's only one lecture. Hovering says "works better with more material."
- **Lenses that explain** — Dragging flashcards onto a raw recording still processing: "Still transcribing — I'll generate cards when that's done. Want to add highlights in the meantime?"

The principle: **never block, always communicate.** This teaches the user the data model without them realising — they learn flashcards work better from annotated material through experience, not onboarding.

---

## Existing Apps That Partially Embody This

No app nails the full malleable vision yet, but several show pieces of it:

| App | What it demonstrates | Where it falls short |
|-----|---------------------|---------------------|
| **Obsidian** | Best real-world gentle slope. Markdown → linking → graph view → community plugins. Spaced repetition plugin turns notes into flashcards in-place. User owns their data (local files). | Plugin system, not a true composable lens model. Plugins can conflict. |
| **Notion** | "Same data, different views" — one database shown as table, kanban, calendar, gallery. | Can't build custom view types. Not truly malleable. |
| **Muse** (Ink & Switch alumni) | Spatial thinking on iPad. Cards, PDFs, notes on infinite boards. Spatial arrangement as thinking. | Single-purpose (thinking/reading), no tool ecosystem. |
| **Tana** | Supertags with structured data, live queries across knowledge. Users share tag configs and queries — sharing tooling, not just content. | Steep learning curve. |
| **Fermat.ws** | Spatial canvas mixing content types (text, code, AI, diagrams). Close to the "desk" metaphor. | Early stage, limited tool ecosystem. |
| **Tldraw** | Open-source infinite canvas becoming infrastructure for spatial interfaces. Shows how a "make anything" surface works. | Drawing tool, not a data platform. |

### Common visual patterns across these apps
- A **canvas or spatial surface** rather than page-based navigation
- **User's content is front and centre**, not buried in app UI
- **Tools/views appear alongside content**, not as separate destinations
- **Drag, arrange, resize** — layout is the user's
- **Minimal chrome**, maximum workspace
