# Malleable PLS - Monetisation Ideas

## Core Principle

The platform's value is in the substrate and the ecosystem, not any single lens. You can't charge for features ("pay to unlock quizzes") — it breaks the malleable philosophy. Charge for things that get more valuable the more the user invests.

---

## D2C Revenue

### Free tier + paid capacity
- Free: recording, transcription, starter lenses, local use
- Paid: AI processing depth (connection-finding, gap analysis, smart card generation), cross-device sync, collaboration/sharing

**Open question:** Storage/transcription volume caps are an obvious lever, but could cause frustration — a student running out of recording hours mid-semester is a terrible experience. Need to explore whether volume limits are the right axis or whether the paid boundary should be elsewhere (AI depth, sync, collaboration). The free tier should never feel punishing.

### Premium curated stacks
Pre-built workspace configurations for specific disciplines:
- Medical school exam prep (spaced repetition tuned for USMLE, clinical case lens)
- Language learning (audio replay, vocabulary extraction, pronunciation comparison)
- Law school (case briefs, argument mapping, statute cross-referencing)

Selling expertise and curation, not features. Students pay for the head start, then customise.

---

## B2B / Institutional Revenue

### Per-student institutional licensing
Universities pay per-student/year. The pitch varies by audience:
- **Administrators**: "Turns passive recording into active learning. Retention and outcomes improve."
- **IT**: "Local-first, students own their data, minimal infrastructure burden. Not another LMS."
- **Faculty**: "Create and share workspace templates for your courses."

Predictable, recurring, high-value revenue.

### Anonymised learning analytics dashboard (upsell)
The substrate contains rich signals about learning patterns. Aggregated and anonymised, this is valuable to institutions:
- "60% of students flagged week 4's thermodynamics lecture as confusing" — informs teaching improvement
- "Students using the review lens 3x/week had 25% higher exam scores" — validates tool impact for procurement
- "Engagement drops 70% after week 8" — triggers student success team intervention

Sold as a separate analytics layer. Students' personal workspaces, annotations, and confidence scores stay private. Institutions get aggregate learning intelligence. High-margin, sticky, and solves a real visibility gap.

### LMS/VLE integration (premium add-on)
Integrate with Blackboard, Canvas, Moodle rather than replacing them:
- Lecture recordings from the LMS auto-appear in the student's substrate
- Course structure informs default workspace scoping
- Assignment deadlines flow into planner lenses

Charge institutions for these integrations. High-value because they reduce student friction and make the tool stickier within the institution's existing ecosystem.

### Private/institutional lenses (premium add-on)
Institutions or third-party organisations may want to build lenses that never touch the public codebase or marketplace:
- A medical school builds a "clinical case" lens tailored to their curriculum
- A corporate training department builds a compliance-specific review lens
- A textbook publisher builds a lens that connects lecture material to their content

Revenue model options:
- **Platform fee** for access to the lens SDK, developer tooling, and the ability to deploy private federated lenses
- **Per-seat hosting** if we host their private lenses on our infrastructure
- **Enterprise tier feature** bundled into institutional licensing

This is a strong B2B upsell because it lets institutions invest in the platform without contributing to competitors' ecosystems. Their lenses are private, their data stays scoped, and they get the full benefit of the substrate without building from scratch.

Technically enabled by the monorepo → microfrontend migration path: private lenses are just federated modules deployed to the institution's own infrastructure (or ours), loaded at runtime via the lens registry.

---

## The Flywheel

Platform adoption and success depends on a reinforcing cycle:

```
More students using the substrate
  → More lens creators building for the ecosystem
    → More/better lenses attract more students
      → More institutional interest (proven adoption)
        → Institutional deals drive whole-cohort adoption
          → More students using the substrate → ...
```

The flywheel also has a data dimension:
- More usage → richer aggregate learning analytics → more valuable institutional dashboard → more institutional sales → more students onboarded at scale

Tracking flywheel health (lens ecosystem growth, organic student adoption, institution conversion) is a key metric for platform success.

---

## The Moat

The student's substrate is their learning history — every recording, annotation, confidence signal, and connection built over semesters. This creates healthy lock-in through investment, not restriction. Students don't abandon years of structured knowledge for a competitor's flashcard app.

For institutions, aggregate learning intelligence compounds over time. More students, more semesters, more insight into what actually works.

---

## Suggested Phasing

| Phase | Focus | Revenue model |
|-------|-------|---------------|
| 1 | D2C, prove the value | Free tier + paid AI/sync/collaboration |
| 2 | Institutional sales | Per-student licensing, LMS integration, faculty templates |
| 3 | Ecosystem maturity | Lens marketplace (platform cut), curated stacks, analytics dashboard |
