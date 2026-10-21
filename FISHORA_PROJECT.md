# Fishora — Project Foundation Document

> **"Catch. Collect. Create your aquarium."**

**Status:** Pre-development — documentation and planning phase.
**Last updated:** 2026-10-21

---

## Table of Contents

- [Project Vision and Goals](#project-vision-and-goals)
- [Target Experience](#target-experience)
- [Core Gameplay Loop](#core-gameplay-loop)
- [Initial Feature Scope](#initial-feature-scope)
- [Proposed Technical Direction](#proposed-technical-direction)
- [Architectural Principles](#architectural-principles)
- [Visual Direction](#visual-direction)
- [Performance Direction](#performance-direction)
- [MVP Roadmap](#mvp-roadmap)
- [AI Agent Working Rules](#ai-agent-working-rules)
- [Out of Scope (MVP)](#out-of-scope-mvp)
- [Open Decisions and Assumptions](#open-decisions-and-assumptions)
- [Supporting Documents](#supporting-documents)

---

## Project Vision and Goals

**Fishora** is a relaxing browser-based aquarium game focused on collecting fish, caring for aquatic life, decorating a personal aquarium, and gradually expanding a collection.

Players own a single aquarium that serves as the primary gameplay screen. They purchase fish and decorations, receive rewards, hatch fish eggs, care for their fish, and customize their aquarium over time.

**Goals:**

1. Deliver an attractive, lively 3D aquarium experience.
2. Make aquarium customization intuitive on desktop and mobile browsers.
3. Provide satisfying collection and progression systems.
4. Encourage players to return through rewards, quests, and egg hatching.
5. Establish a maintainable technical foundation for future gameplay expansion.

> **Note:** "Fishora" is a working name. Domain and trademark availability have not been verified. See [Open Decisions](#open-decisions-and-assumptions).

---

## Target Experience

- **Aquarium-first.** The aquarium is the core experience — the main screen and primary expression of progress.
- **Relaxing and accessible.** Low-pressure gameplay with no fail states (pending fish care decisions).
- **Semi-realistic 3D.** Believable fish silhouettes, natural swimming, environmental depth.
- **Collectible-driven.** Players are motivated to discover, collect, and care for fish.
- **Return-worthy.** Daily rewards, quests, egg hatching, and passive income encourage regular visits.
- **Cross-platform.** Desktop and mobile web are equally important.

---

## Core Gameplay Loop

```
Receive starting coins and items → Purchase fish, eggs, and decorations →
Place fish and decorations in the aquarium → Feed and interact with fish →
Maintain fish care indicators → Complete quests and collection milestones →
Earn coins, eggs, and other rewards → Hatch eggs and expand the collection →
Improve the aquarium and unlock additional content →
Return to collect eligible rewards and continue progressing
```

This loop must be validated through the prototype and early playtesting.

> **Note:** Fishing is a potential future feature. It is explicitly excluded from the MVP.

---

## Initial Feature Scope

| Feature Area | MVP Status |
|---|---|
| Personal 3D aquarium (main screen) | ✅ Confirmed |
| Fixed camera with zoom and adjustable viewing angle | ✅ Confirmed |
| Fish species with 5 rarity tiers | ✅ Confirmed |
| Natural fish swimming animation | ✅ Confirmed |
| Fish care (feeding, monitoring, interaction) | ✅ Confirmed (details TBD) |
| Fish eggs with real-time incubation and hatching | ✅ Confirmed (details TBD) |
| Aquatic plants, rocks, coral, decorative objects | ✅ Confirmed |
| Placement, movement, rotation, and removal of objects | ✅ Confirmed |
| Hybrid easy-placement + precision editing | ✅ Confirmed |
| Daily login rewards | ✅ Confirmed |
| Coins and in-game economy | ✅ Confirmed |
| Passive income over time | ✅ Confirmed (details TBD) |
| Quests and achievements | ✅ Confirmed |
| Collection milestones | ✅ Confirmed |
| Item shop | ✅ Confirmed |
| Inventory and aquarium layout persistence | ✅ Confirmed |
| Progression and unlockable content | ✅ Confirmed |
| Login and server-side persistence | ✅ Confirmed |
| Free-to-play, no monetization in MVP | ✅ Confirmed |

> **Note:** Exact item prices, fish catalog, care mechanics, egg rules, quest catalog, and progression values are **TBD**. See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) and [docs/decisions/README.md](docs/decisions/README.md).

---

## Proposed Technical Direction

| Layer | Proposed Technology |
|---|---|
| Frontend framework | Next.js, React, TypeScript |
| 3D rendering | Three.js via React Three Fiber |
| Backend | Next.js Route Handlers |
| Database | PostgreSQL with Prisma ORM |
| Hosting | Vercel (potential initial option) |

These are **proposed choices** based on initial preferences. They have not been validated by a working prototype. See [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md) for details.

---

## Architectural Principles

1. **Client responsibility:** Rendering, aquarium animation, camera controls, visual effects, UI.
2. **Server responsibility:** Authentication, currency changes, purchases, rewards, egg hatching validation, quest completion, and all economically sensitive operations.
3. **Database responsibility:** Accounts, wallets, inventory, fish ownership, care state, egg state, transaction history, quest progress, and aquarium layouts.
4. **Minimal persistence:** Do not persist fish positions every frame. Persist only the state needed to reconstruct the aquarium.
5. **Separation of concerns:** Keep gameplay logic separate from rendering logic.
6. **Server-authoritative timing:** Use server timestamps for daily rewards, egg incubation, and passive income — never rely on client clocks.
7. **Simplicity first:** Prefer simple, maintainable systems that can be expanded later.
8. **Single-player MVP:** Do not design multiplayer architecture for the initial release.

---

## Visual Direction

- **Art style (confirmed):** Semi-realistic 3D, resembling real aquatic life.
- **Priority:** Believable fish silhouettes, natural swimming, aquatic plants, rocks, lighting, and environmental depth.
- **Aquarium feel:** Alive — fish swim naturally, plants sway subtly, lighting creates atmosphere.
- **Avoid:** Expensive rendering techniques, unnecessary physics simulations, overly complex shaders.
- **UI:** Readable and usable on both desktop and mobile browsers. Mobile controls must not depend on hover.

> **TBD:** Specific art references, model style, color palette, and asset sources. See [docs/decisions/README.md](docs/decisions/README.md).

---

## Performance Direction

### Optimization Principles

- Reuse geometry, materials, and 3D assets.
- Use `InstancedMesh` when appropriate for repeated objects.
- Limit dynamic shadows, post-processing, and expensive shaders.
- Consider LOD and frustum culling when justified by profiling.
- Avoid triggering React state updates on every animation frame.
- Reuse animation systems and avoid unnecessary physics calculations.
- Track FPS, draw calls, loading time, and asset sizes.
- Test on lower-spec desktop hardware and mobile devices.

### Performance Targets

| Platform | Target FPS | Status |
|---|---|---|
| Capable desktop hardware | 60 FPS | Target — validate through profiling |
| Mobile devices | 30–60 FPS | Target — device-dependent |

These are targets to validate, not guaranteed performance claims.

---

## MVP Roadmap

The roadmap is structured so the **3D aquarium prototype is validated before major backend work begins**.

| Phase | Name | Key Dependency |
|---|---|---|
| 1 | Project Foundation and Game Design | — |
| 2 | 3D Aquarium Prototype | Phase 1 |
| 3 | Core Persistence | Phase 2 (prototype validated) |
| 4 | Shop and Customization | Phase 3 |
| 5 | Fish Care and Progression | Phase 3 |
| 6 | Eggs and Rewards | Phases 4 and 5 |
| 7 | QA and Initial Release | Phase 6 |

**Tentative estimate:** 4–8 weeks for a full-time solo developer using existing assets and a tightly scoped MVP. This is a rough estimate, not a commitment. Should be reassessed after the prototype.

For detailed phase descriptions, see [docs/MVP_ROADMAP.md](docs/MVP_ROADMAP.md).

---

## AI Agent Working Rules

Fishora may be developed with AI coding agents (e.g., Google Antigravity, Claude Code). All agents must follow these mandatory principles:

1. **Inspect first.** Examine the actual repository before proposing implementation changes.
2. **Respect conventions.** Identify existing conventions and dependencies before choosing an approach.
3. **Plan before acting.** Summarize findings and provide a short plan before modifying code.
4. **Small steps.** Break work into small, verifiable tasks.
5. **Preserve existing work.** Do not break existing functionality unless an approved change requires it.
6. **Verify honestly.** Run relevant tests and builds. Never claim a test passed if it was not executed.
7. **Be minimal.** Avoid unnecessary dependencies, premature abstraction, and overengineering.
8. **Keep docs current.** Synchronize documentation with significant architectural and product decisions.
9. **Don't invent requirements.** Do not treat TBD values as finalized or implement excluded features without approval.
10. **Ask when needed.** Seek clarification only for material product conflicts, irreversible decisions, or unresolved safety/security risks.

---

## Out of Scope (MVP)

The following are explicitly **not** included in the initial MVP:

- Fishing gameplay, rods, bait, and fishing locations.
- Real-time multiplayer.
- Player-to-player trading.
- Complex social systems.
- Paid currency and monetization.
- Large-scale live-service infrastructure.
- Expensive or unnecessary physical simulations.

**MVP priority:** Prove that the aquarium looks good, runs smoothly, and supports an enjoyable purchase → collect → care → decorate gameplay loop.

Fishing may be considered after the aquarium experience and core progression have been validated.

---

## Open Decisions and Assumptions

### Assumptions

- The game is single-player for the MVP.
- The developer has access to or can acquire semi-realistic 3D fish and decoration assets.
- Desktop and mobile web are equally important platforms.
- The target audience prefers relaxing, collectible-driven gameplay.

### Key Open Decisions

A full tracker of unresolved decisions is maintained in [docs/decisions/README.md](docs/decisions/README.md). Key open items include:

- Final project name and branding (domain/trademark not verified).
- Art references, color palette, and asset sources.
- Fish care indicators, decay mechanics, and health consequences.
- Fish death and irreversible loss policy.
- Egg incubation durations and hatch outcome rules.
- Coin economy values (prices, rewards, passive income).
- Fish catalog and initial content quantity.
- Aquarium capacity and expansion rules.
- Quest catalog and progression formula.
- Authentication method.
- Deployment platform confirmation.

---

## Supporting Documents

| Document | Purpose |
|---|---|
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | Full GDD — gameplay systems, economy rules, fish care, eggs, acceptance criteria |
| [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md) | Tech stack details, architecture, performance and security principles |
| [docs/MVP_ROADMAP.md](docs/MVP_ROADMAP.md) | Phased roadmap with dependencies and deliverables |
| [docs/decisions/README.md](docs/decisions/README.md) | Open decisions tracker |
