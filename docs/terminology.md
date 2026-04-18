# Malleable PLS - Terminology & Concepts

## Core Concepts

### Malleable Software
A software ecosystem where anyone can adapt their tools to their needs with minimal friction. Users are active co-creators, not passive consumers. Originates from Ink & Switch research.

### Personal Learning System (PLS)
A learner-centered environment where students actively use their own captured materials (audio notes, lectures, annotations) as the foundation for deeper understanding and retention. The shift from "we help you capture lectures" to "we help you learn from what you've captured."

### Data Substrate
The shared, local-first data layer that all lenses read from and write to. This is the single most critical architectural decision. It holds core primitives (recordings, transcripts, annotations, etc.) and syncs across devices and users via CRDTs.

### Lens
A composable, self-contained tool that provides a specific view or interaction over the data substrate. Lenses never communicate with each other directly — all interaction is emergent through shared data. Examples: flashcard lens, quiz lens, weekly review lens, connections lens.

### Workspace
A preserved arrangement of lenses, layout, and configuration — separated from the data that flows through it. Think of it as a pair of smart glasses: each pair gives you different overlays (lenses and their configuration) suited to a particular activity. Your "In Lecture" glasses show a minimal capture overlay. Your "Evening Review" glasses show transcript detail, quiz prompts, weekly progress. What you're *looking at* — which course, which time period, which material — is independent of which glasses you're wearing. You don't need separate glasses for biology and chemistry; you put on your review glasses and look at different material by changing the **scope**. Workspaces are live (data updates as scope changes) and shareable (someone else wears your glasses and sees their own material through your overlays).

### Gentle Slope
A design principle from Allan MacLean's research. Customization difficulty should increase smoothly, not in cliffs. Each incremental step in modification power requires a proportionally small skill investment. Spreadsheets are the canonical example.

### Micro-App
A workspace panel that is mostly self-contained, bringing its own domain rather than viewing the substrate differently. A planner is the canonical example. Micro-apps can still read/write the substrate when useful. The platform doesn't formally distinguish lenses from micro-apps — they sit on a spectrum (see technical-guidance.md).

### Audio as Unique Primitive
Audio is the primary data primitive, not text. Timestamps are the universal anchor — every annotation, question, and connection points back to a moment in a recording. The transcript is just one lens on the audio, not the canonical form.

### Audio Capture vs Transcript: Separate Concerns
Audio capture and transcript interaction are independent lenses. The audio capture lens writes Recordings to the substrate. A background processing job creates Transcript Segments from those recordings. The transcript lens reads segments and enables inline interaction — tagging, annotation, confusion markers, linking — writing these back to the substrate for other lenses to consume. This separation is a canonical example of the substrate model: two lenses that appear tightly related but have no knowledge of each other, connected only through shared data types.

A lens that both displays content and lets you annotate it is not violating single-responsibility — "view and mark up timestamped content" is one coherent concern. A lens becomes an SPA when it handles unrelated concerns (quizzing, scheduling, review aggregation), not when it writes to the substrate.

## Design Principles

### Opinionated Defaults, Transparent Seams
Every lens should work well out of the box with zero configuration. Customization is an escape valve, not a requirement. But the seams (how it works, what data it reads, what you can change) are visible and pullable when the user is ready.

### Three-Layer Lens Model
- **Layer 1: It just works** — Good defaults, zero config. ~80% of users stay here.
- **Layer 2: Visible knobs** — Change inputs, formats, behaviors through direct manipulation. No code. ~15% of users.
- **Layer 3: Fork and modify** — Inspect the lens definition, change the logic, share your version. ~5% of users.

### Tools, Not Applications
Build composable general-purpose tools (knives) rather than single-purpose apps (avocado slicers). Tools operate on shared data and can be combined in ways the designer didn't anticipate.

### Affordance Over Restriction
Lenses declare what data types they find useful, not what they require. A lens applied to insufficient data doesn't error — it communicates what would help and works with what it has. "Never block, always communicate."

## Scaling Rules

### Rule 1: Lenses are pure functions of data, not of each other
No lens-to-lens communication. Ever. If you're tempted to add it, you're missing a core data type.

### Rule 2: Core data types grow by ones, not by N
Adding a new lens should almost never require a new core type. Lens-specific data is stored as opaque metadata on existing primitives, invisible to other lenses.

### Rule 3: Scope is the user's complexity dial
Workspaces scope what data lenses process. A workspace scoped to one course and one week is focused. The user controls this through natural actions (organising, tagging, time-bounding), not system configuration.

## Data Flow Model

### Transitive and Invisible (Default)
Data flows between lenses implicitly through the shared substrate. The user never wires anything. The quiz lens writes a "weak spot," the review lens reads it. They appear to collaborate but have never met.

### Scoping by Exclusion
When the default flow does something unwanted, the user scopes by excluding — "not this material," "not that time period," "not for them." This feels like filtering, not plumbing.

### Boundary Types
Four natural scoping boundaries users already understand:
- **Topic** — "my biology stuff" vs "my chemistry stuff"
- **Time** — "this semester" vs "last semester"
- **Privacy** — "for me" vs "shared with study group"
- **Intent** — "this counts" vs "I was just messing around"

## Core Data Primitives

A small, stable set of types that the platform team owns. Lenses read and write these — they are the shared vocabulary.

- **Recording** — audio blob + duration + timestamp
- **Transcript** — text segments linked to recording timestamps
- **Annotation** — user-created, anchored to a moment or span
- **Tag** — a label on anything (confused, key concept, exam-relevant)
- **Link** — a connection between any two things
- **Confidence Signal** — a score on a piece of material (from quizzes, self-assessment, spaced repetition)
- **Workspace** — an arrangement of lenses and scoping rules
