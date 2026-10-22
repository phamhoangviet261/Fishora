# Technical Architecture — Fishora

> See also: [FISHORA_PROJECT.md](../FISHORA_PROJECT.md) · [GAME_DESIGN.md](GAME_DESIGN.md) · [MVP_ROADMAP.md](MVP_ROADMAP.md)

**Status:** Proposed — no implementation exists yet. All technology choices are subject to validation.

---

## Proposed Tech Stack

| Layer | Technology | Status |
|---|---|---|
| Frontend framework | Next.js + React + TypeScript | Proposed |
| 3D rendering | Three.js via React Three Fiber | Proposed |
| Backend | Next.js Route Handlers | Proposed |
| Database | PostgreSQL (Neon) + Prisma ORM | Decided |
| Hosting | Vercel | Under consideration |

These choices are based on initial preferences for developer experience, ecosystem maturity, and deployment simplicity. They should be confirmed or revised once the aquarium prototype is built.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│                  Browser Client                  │
│                                                  │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   React UI   │  │  React Three Fiber (R3F)  │  │
│  │  (shop, HUD, │  │  (aquarium, fish, plants, │  │
│  │  inventory,  │  │   lighting, camera,       │  │
│  │  care, quests)│ │   placement controls)     │  │
│  └──────┬───────┘  └────────────┬─────────────┘  │
│         │                       │                │
│         └───────────┬───────────┘                │
│                     │                            │
│            Game State (client)                   │
└─────────────────────┬────────────────────────────┘
                      │ HTTPS (API calls)
┌─────────────────────┴────────────────────────────┐
│               Next.js Server                     │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │          Route Handlers (API)            │    │
│  │  - Authentication                        │    │
│  │  - Wallet / currency operations          │    │
│  │  - Shop purchases                        │    │
│  │  - Fish care state updates               │    │
│  │  - Egg incubation and hatching           │    │
│  │  - Quest and achievement validation      │    │
│  │  - Daily rewards                         │    │
│  │  - Passive income collection             │    │
│  │  - Inventory management                  │    │
│  │  - Aquarium layout persistence           │    │
│  └──────────────────┬───────────────────────┘    │
│                     │                            │
│  ┌──────────────────┴───────────────────────┐    │
│  │           Prisma ORM                     │    │
│  └──────────────────┬───────────────────────┘    │
└─────────────────────┬────────────────────────────┘
                      │
              ┌───────┴────────┐
              │  PostgreSQL    │
              └────────────────┘
```

---

## Responsibility Boundaries

### Client (Browser)

- 3D rendering of the aquarium scene.
- Fish swimming animation and aquatic plant movement.
- Fixed camera with zoom and viewing-angle adjustment.
- Object placement, movement, rotation, and removal controls.
- UI rendering (shop, inventory, fish care, quests, HUD).
- Visual effects (lighting, particles, water).
- Desktop and mobile interaction handling (mouse, keyboard, touch).
- No authoritative game state — the client requests actions and displays results.

### Server (Next.js Route Handlers)

- Authentication and session management.
- All currency transactions (earn, spend, passive income collection).
- Shop purchase validation (atomic deduction + item grant).
- Fish care state updates.
- Egg incubation tracking and hatch validation (server-authoritative timestamps).
- Quest completion and reward validation (idempotent).
- Daily reward granting and duplicate prevention.
- Passive income accrual calculation.
- Inventory and aquarium layout persistence.
- Transaction history logging.
- Selling validation (ownership + placement state checks).

### Database (PostgreSQL)

Stores persistent game state (logical requirements — schema TBD):

- Player accounts and authentication data.
- Wallet balances and transaction history.
- Inventory (owned fish, items, decorations, equipment).
- Fish placement state (owned vs. placed in aquarium).
- Fish care state (care indicators, last fed timestamp, etc.).
- Egg ownership and incubation state (start time, type, status).
- Quest progress and reward claims.
- Collection milestone progress.
- Player progression / level.
- Aquarium layouts (item positions, rotations, configuration).

> **Note:** The database schema has not been designed. It will be defined during Phase 3 implementation. Do not invent tables or columns prematurely.

---

## Architectural Principles

1. **Server-authoritative economy.** All coin changes, purchases, rewards, and timed events must be validated server-side. The client cannot unilaterally grant itself resources.

2. **Server-authoritative timing.** Daily rewards, egg incubation, and passive income must use server timestamps. Never rely on client clocks or require the game to remain open.

3. **Atomic transactions.** A purchase must atomically deduct coins and grant the item. A failed purchase must not deduct coins without granting the item.

4. **Idempotent rewards.** Reward claims (quests, daily login, milestones) must be idempotent. Repeated requests must not grant duplicate rewards.

5. **Auditable changes.** Every currency change should have an auditable transaction record.

6. **Minimal persistence.** Persist only what is needed to reconstruct the aquarium (which fish the player owns, item placements, care state). Do not stream fish positions to the database every frame.

7. **Ownership vs. placement.** The data model must distinguish between owning an item and having it placed in the aquarium. Removing from the aquarium does not lose ownership.

8. **Separation of rendering and logic.** Game rules (purchasing, rewards, care mechanics) should be in server-side modules, not embedded in React components or R3F scene code.

9. **Stateless API requests.** Route Handlers should authenticate each request independently. Avoid server-side session state that complicates scaling.

10. **Simple before scalable.** Build the simplest correct implementation first. Optimize and refactor only when profiling reveals a need.

11. **Single-player MVP.** No WebSocket connections, real-time sync, or multiplayer state management in the initial release.

---

## Performance Principles

### 3D Rendering

| Principle | Details |
|---|---|
| Asset reuse | Share geometry and materials across identical objects |
| Instancing | Use `InstancedMesh` for repeated decorations, plants, bubbles |
| Shadow budget | Limit dynamic shadows; prefer baked or simplified shadows |
| Post-processing | Use sparingly; measure cost of each effect |
| Shaders | Avoid expensive fragment shaders for large surfaces |
| LOD | Consider level-of-detail for complex models if profiling warrants it |
| Frustum culling | Enabled by default in Three.js; ensure it is not inadvertently disabled |
| Physics | Avoid unnecessary physics simulation; use animation for fish swimming |

### React / State Management

| Principle | Details |
|---|---|
| Frame-independent state | Do not trigger React re-renders on every animation frame |
| Ref-based animation | Use `useRef` and `useFrame` for per-frame updates, not `useState` |
| Memoization | Memoize expensive computations and stable components |
| Code splitting | Lazy-load non-critical UI panels |

### Monitoring

Track these metrics during development:

- Frames per second (FPS).
- Draw calls per frame.
- Total scene triangle count.
- Asset loading time.
- Individual asset file sizes.
- Memory usage.

### Performance Targets

| Platform | Target | Notes |
|---|---|---|
| Desktop (capable hardware) | 60 FPS | Primary development target |
| Mobile (modern devices) | 30–60 FPS | Device-dependent; validate through testing |

These are aspirational targets to validate through profiling, not performance guarantees.

---

## Security Considerations

Even for a single-player browser game, basic security hygiene applies:

- **Server-side validation** for all economic operations (no client-trusted currency).
- **Rate limiting** on API endpoints to prevent abuse.
- **Duplicate prevention** for daily login rewards, quest rewards, and egg hatches.
- **Input validation** on all user-submitted data.
- **Authentication** before any state-modifying operation.
- **Ownership verification** before selling items or modifying placement.
- **Timestamp validation** for all timed mechanics (eggs, daily rewards, passive income).

> **TBD:** Specific authentication method, session management approach, and rate-limiting strategy.

---

## Open Technical Decisions

These are tracked centrally in [decisions/README.md](decisions/README.md). Key technical questions include:

- Authentication method (email/password, OAuth providers, anonymous/guest accounts).
- Session management (JWT, server sessions, or hybrid).
- Asset pipeline (how 3D models are sourced, optimized, and loaded).
- State management library (if any beyond React state and context).
- Error handling and logging strategy.
- CI/CD pipeline and deployment workflow.
- Database hosting provider.
- CDN for static assets and 3D models.
- Fish care state update strategy (polling vs. on-demand calculation).
- Egg incubation check mechanism (client polling interval, push notifications, or on-load calculation).
