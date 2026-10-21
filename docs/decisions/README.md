# Open Decisions Tracker — Fishora

> See also: [FISHORA_PROJECT.md](../../FISHORA_PROJECT.md) · [GAME_DESIGN.md](../GAME_DESIGN.md) · [TECHNICAL_ARCHITECTURE.md](../TECHNICAL_ARCHITECTURE.md) · [MVP_ROADMAP.md](../MVP_ROADMAP.md)

This document tracks decisions that are **unresolved, assumed, or explicitly deferred**. Each entry records the question, its current status, and when it needs to be resolved.

As decisions are made, update the status and record the rationale. Completed decisions can be moved to the [Resolved Decisions](#resolved-decisions) section for historical reference.

---

## How to Use This Tracker

- **Open:** No decision has been made. Needs resolution before the listed phase.
- **Assumed:** A working assumption is in place but has not been formally decided.
- **Deferred:** Intentionally postponed. Will be revisited at the noted time.
- **Resolved:** Decision made and recorded.

---

## Open Decisions

### Branding and Identity

| # | Question | Status | Needed By | Notes |
|---|---|---|---|---|
| D-001 | Final project name | Open | Before public release | "Fishora" is a working name. Domain and trademark availability not verified. |
| D-002 | Logo and brand identity | Open | Before public release | No design work started. |
| D-003 | Project slogan | Assumed | Before public release | Currently "Catch. Collect. Create your aquarium." — may change. |

### Visual and Art Direction

| # | Question | Status | Needed By | Notes |
|---|---|---|---|---|
| D-010 | Art style reference images | Open | Phase 2 | Semi-realistic 3D direction is confirmed; specific references not selected. |
| D-011 | Color palette | Open | Phase 2 | No palette defined. |
| D-012 | 3D asset sources | Open | Phase 2 | Options: free asset packs, purchased packs, custom-created, AI-generated, or a mix. |
| D-013 | Fish model style and detail level | Open | Phase 2 | Must be semi-realistic. Detail level depends on performance budget. |
| D-014 | UI visual design system | Open | Phase 2 | No component library or design tokens selected. |

### Fish Care

| # | Question | Status | Needed By | Notes |
|---|---|---|---|---|
| D-020 | Which care indicators exist | Open | Phase 5 | e.g., hunger, happiness, health. Not defined. |
| D-021 | Indicator decay model | Open | Phase 5 | Continuous decay vs. discrete intervals. |
| D-022 | Feeding frequency and costs | Open | Phase 5 | How often fish must be fed and what it costs. |
| D-023 | Poor care consequences | Open | Phase 5 | How neglect affects fish behavior and health. |
| D-024 | Fish death / irreversible loss | Open | Phase 5 | **Requires explicit product decision.** Must not be implemented by default. |
| D-025 | Care rewards | Open | Phase 5 | Whether good care produces coins, XP, or other benefits. |

### Eggs and Hatching

| # | Question | Status | Needed By | Notes |
|---|---|---|---|---|
| D-030 | Incubation duration | Open | Phase 6 | Per-egg-type or uniform duration. |
| D-031 | Hatch outcome determination | Open | Phase 6 | Predetermined species vs. randomized. |
| D-032 | Egg rarity influence on hatch | Open | Phase 6 | Whether egg rarity affects outcome quality. |
| D-033 | Egg types | Open | Phase 6 | Whether different egg types produce different fish pools. |
| D-034 | Egg sellability / transferability | Open | Phase 6 | Whether eggs can be sold or are account-bound. |
| D-035 | Free egg reward intervals | Open | Phase 6 | How frequently free eggs are available. |
| D-036 | Manual claim vs. auto-delivery | Open | Phase 6 | Whether players must manually claim hatched fish. |
| D-037 | Egg placement in aquarium | Open | Phase 6 | Whether incubating eggs must be placed in a specific location. |

### Economy and Balancing

| # | Question | Status | Needed By | Notes |
|---|---|---|---|---|
| D-040 | Starting coin balance | Open | Phase 3 | Enough for several basic fish and decorations; exact amount TBD. |
| D-041 | Fish prices | Open | Phase 4 | Per-species, influenced by rarity. |
| D-042 | Decoration prices | Open | Phase 4 | Per-item pricing. |
| D-043 | Egg prices | Open | Phase 6 | Per-type pricing. |
| D-044 | Daily login reward amounts | Open | Phase 6 | Type (coins, items, eggs) and scaling TBD. |
| D-045 | Quest reward amounts | Open | Phase 5 | Must be balanced against other income sources. |
| D-046 | Collection milestone rewards | Open | Phase 5 | Reward type and amounts. |
| D-047 | Selling prices | Open | Phase 4 | Sell-back percentage or fixed values. |
| D-048 | Passive income formula | Open | Phase 6 | Source, rate, storage limit, collection process, offline behavior. |
| D-049 | Aquarium expansion costs | Open | Phase 4 | Whether capacity upgrades exist and their cost. |

### Game Content

| # | Question | Status | Needed By | Notes |
|---|---|---|---|---|
| D-050 | Fish species catalog (MVP) | Open | Phase 2–5 | Number and types of fish at launch. |
| D-051 | Rarity distribution | Open | Phase 4 | How many fish per rarity tier. |
| D-052 | Decoration catalog | Open | Phase 4 | Number and types of decorations at launch. |
| D-053 | Quest catalog | Open | Phase 5 | Specific quests, objectives, and rewards. |
| D-054 | Aquarium capacity limits | Open | Phase 4 | Max fish, max items, upgrade tiers. |

### Placement and Interaction

| # | Question | Status | Needed By | Notes |
|---|---|---|---|---|
| D-060 | Placement system details | Open | Phase 2–4 | Grid-based, free-placement, or slot-based. |
| D-061 | Collision rules | Open | Phase 4 | Whether objects can overlap, stack, or must respect boundaries. |
| D-062 | Invalid placement handling | Open | Phase 4 | Visual feedback and behavior when placement is rejected. |
| D-063 | Precision editing controls | Open | Phase 4 | How hybrid easy/precision editing works in practice. |

### Technical Decisions

| # | Question | Status | Needed By | Notes |
|---|---|---|---|---|
| D-070 | Authentication method | Open | Phase 3 | Email/password, OAuth (Google, GitHub, etc.), anonymous/guest, or combination. |
| D-071 | Session management approach | Open | Phase 3 | JWT, server sessions, or hybrid. |
| D-072 | State management library | Open | Phase 2 | React state + context may suffice; Zustand or similar is an option. |
| D-073 | Asset loading and optimization | Open | Phase 2 | GLTF compression (Draco/Meshopt), texture optimization, lazy loading. |
| D-074 | Database hosting | Open | Phase 3 | Supabase, Neon, Railway, AWS RDS, etc. |
| D-075 | CDN for assets | Open | Phase 3 | Vercel's built-in CDN vs. separate provider. |
| D-076 | CI/CD pipeline | Open | Phase 2 | GitHub Actions, Vercel auto-deploy, or another approach. |
| D-077 | Error monitoring and logging | Open | Phase 3 | Sentry, LogRocket, custom logging, or defer. |
| D-078 | Deployment platform | Assumed | Phase 3 | Vercel is assumed; not confirmed. |
| D-079 | Care state update strategy | Open | Phase 5 | Polling vs. on-demand calculation vs. hybrid. |
| D-080 | Egg check mechanism | Open | Phase 6 | Client polling interval vs. on-load calculation. |

### Business and Product

| # | Question | Status | Needed By | Notes |
|---|---|---|---|---|
| D-090 | Monetization model (post-MVP) | Deferred | Post-MVP | Free-to-play with ads, premium currency, one-time purchase, or fully free. |
| D-091 | Target audience validation | Assumed | Phase 2 | Casual players who enjoy relaxing, collectible-driven games. Not formally validated. |
| D-092 | Analytics and telemetry | Open | Phase 7 | What player behavior data to collect (if any) and how. |
| D-093 | Privacy policy and legal | Open | Before public release | GDPR, COPPA, cookie consent, terms of service. |
| D-094 | Onboarding / tutorial | Open | Phase 7 | Guided experience scope and design. |
| D-095 | Supported browsers | Open | Phase 2 | Minimum browser versions and feature requirements. |

---

## Assumptions

These are working assumptions currently in effect. They should be periodically reviewed.

| # | Assumption | Confidence | Review By |
|---|---|---|---|
| A-001 | The game is single-player for the MVP. | High | Phase 7 |
| A-002 | The developer has access to or can acquire semi-realistic 3D assets. | Medium | Phase 2 |
| A-003 | Vercel can handle the hosting requirements for MVP. | Medium | Phase 3 |
| A-004 | PostgreSQL is sufficient for the data model. | High | Phase 3 |
| A-005 | Next.js + R3F + Prisma will work together without major issues. | Medium | Phase 2 |
| A-006 | A single developer can deliver the MVP in 4–8 weeks. | Low | Phase 2 |
| A-007 | Desktop and mobile web are equally important platforms. | High | — |
| A-008 | Fish care can be designed to be engaging without being punishing. | Medium | Phase 5 |
| A-009 | Semi-realistic 3D assets are achievable within the performance budget. | Medium | Phase 2 |

---

## Resolved Decisions

| # | Question | Decision | Date | Rationale |
|---|---|---|---|---|
| R-001 | Visual direction | Semi-realistic 3D | 2026-10-21 | Resembles real aquatic life; more immersive than stylized. |
| R-002 | Core gameplay focus | Aquarium management, not fishing | 2026-10-21 | Aquarium-first principle; fishing deferred to post-MVP. |
| R-003 | Camera type | Fixed default with zoom and adjustable angle | 2026-10-21 | Simpler than orbit; works well on mobile. |
| R-004 | Rarity tiers | 5 tiers (Common → Legendary) | 2026-10-21 | Provides sufficient progression depth. |
| R-005 | Placement approach | Hybrid easy-placement + precision editing | 2026-10-21 | Balances accessibility and customization. |
| R-006 | Business model (MVP) | Free-to-play, no monetization | 2026-10-21 | Validate gameplay before monetization decisions. |
| R-007 | Platform priority | Desktop and mobile equally important | 2026-10-21 | Maximize reach for a browser game. |
| R-008 | Fish acquisition (MVP) | Shop purchase, quest rewards, egg hatching | 2026-10-21 | Fishing excluded from MVP. |
