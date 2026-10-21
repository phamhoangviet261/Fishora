# Game Design Document — Fishora

**Version:** 1.0 — Draft
**Status:** Product direction established; detailed balancing and some mechanics remain TBD.
**Project name:** Fishora (working name)
**Proposed slogan:** Catch. Collect. Create your aquarium.

> See also: [FISHORA_PROJECT.md](../FISHORA_PROJECT.md) · [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md) · [MVP_ROADMAP.md](MVP_ROADMAP.md) · [decisions/README.md](decisions/README.md)

---

## Table of Contents

- [1. Product Overview](#1-product-overview)
- [2. Target Experience](#2-target-experience)
- [3. Core Gameplay Loop](#3-core-gameplay-loop)
- [4. MVP Scope](#4-mvp-scope)
- [5. Economy and Business Rules](#5-economy-and-business-rules)
- [6. Accounts and Persistence](#6-accounts-and-persistence)
- [7. UX Requirements](#7-ux-requirements)
- [8. Prototype Scope](#8-prototype-scope)
- [9. Out of Scope](#9-out-of-scope)
- [10. Acceptance Criteria](#10-acceptance-criteria)
- [11. Open Decisions](#11-open-decisions)
- [12. Current Product Decisions Summary](#12-current-product-decisions-summary)

---

## 1. Product Overview

Fishora is a relaxing browser-based aquarium game focused on collecting fish, caring for aquatic life, decorating a personal aquarium, and gradually expanding a collection.

Players own a single aquarium that serves as the primary gameplay screen. They purchase fish and decorations, receive rewards, hatch fish eggs, care for their fish, and customize their aquarium over time.

> **Note:** Fishing is a potential future feature and is explicitly excluded from the MVP.

### Product Goals

1. Deliver an attractive, lively 3D aquarium experience.
2. Make aquarium customization intuitive on desktop and mobile browsers.
3. Provide satisfying collection and progression systems.
4. Encourage players to return through rewards, quests, and egg hatching.
5. Establish a maintainable technical foundation for future gameplay expansion.

### Product Principles

1. **Aquarium-first:** The aquarium is the core experience.
2. **Relaxing** rather than competitive.
3. **Collection and customization** should be rewarding.
4. **Fish care** adds engagement without creating unnecessary frustration.
5. **Performance and usability** are essential product requirements.
6. **Small MVP:** Validate before expanding.

---

## 2. Target Experience

### Visual Direction

**Confirmed:** Semi-realistic 3D, with fish and aquarium environments that resemble real aquatic life.

- Prioritize believable fish silhouettes, natural swimming, aquatic plants, rocks, lighting, and environmental depth.
- Remain visually appealing without requiring expensive rendering techniques.

> **TBD:** Specific art references, model style, color palette, and asset sources.

### Platform

**Confirmed:** Desktop and mobile web are equally important.

- Support mouse, keyboard, and touch interactions.
- Aquarium controls must remain usable on small screens.

### Business Model

**Confirmed:** Free to play, with no monetization in the MVP.

Premium currencies, paid cosmetics, advertising, and other monetization systems are out of scope.

---

## 3. Core Gameplay Loop

```
Receive starting coins and items → Purchase fish, eggs, and decorations →
Place fish and decorations in the aquarium → Feed and interact with fish →
Maintain fish care indicators → Complete quests and collection milestones →
Earn coins, eggs, and other rewards → Hatch eggs and expand the collection →
Improve the aquarium and unlock additional content →
Return to collect eligible rewards and continue progressing
```

This loop must be validated through the prototype and early playtesting.

---

## 4. MVP Scope

### 4.1 Aquarium and 3D Rendering

Required capabilities:

- One personal aquarium per player.
- Fixed default camera with zoom and adjustable viewing angle.
- Natural swimming animation for multiple fish.
- Aquarium plants, rocks, and decorative objects.
- Aquarium lighting and environmental presentation.
- Placement, movement, rotation, and removal of supported objects.
- Save and restore the aquarium layout.
- Responsive controls for desktop and mobile.

Aquarium capacity may expand through progression. The initial capacity and expansion rules remain TBD.

### 4.2 Fish Collection

Players can:

- Browse available fish in the shop.
- Purchase fish using coins.
- Receive fish through quests, rewards, and collection milestones.
- Obtain fish by hatching eggs.
- View owned fish in their inventory.
- Place owned fish into the aquarium.
- Remove fish from the aquarium without losing ownership.

The exact fish catalog and the number of fish supported at launch will be determined after the 3D prototype and performance testing.

### 4.3 Fish Care

Fish care is part of the intended MVP gameplay.

Proposed care interactions include:

- Feeding fish.
- Monitoring fish condition.
- Interacting with fish through simple actions.
- Responding to care requirements over time.

The following rules are **not yet finalized:**

| Decision | Status |
|---|---|
| Which care indicators exist | TBD |
| Whether indicators decay continuously or at discrete intervals | TBD |
| Feeding frequency and resource costs | TBD |
| How poor care affects fish health and behavior | TBD |
| Whether fish can become sick or die | TBD |
| Whether care produces rewards or progression benefits | TBD |

> **Design constraint:** Care should create meaningful engagement without becoming an excessively punishing chore. Fish death and irreversible loss must not be implemented without an explicit product decision.

### 4.4 Aquarium Decoration

Players can:

- Purchase decorations and equipment.
- Place, move, rotate, and remove supported objects.
- Customize the aquarium layout.
- Save and restore their arrangement.

The placement system should combine simple placement controls with optional precision adjustments.

> **TBD:** Collision rules, placement boundaries, object stacking, and invalid-placement handling.

### 4.5 Shop and Inventory

The shop provides access to fish, eggs, and decorative items. The inventory records the player's owned items and supports placing eligible objects in the aquarium.

Purchases must be validated by the server. The client must never independently determine authoritative balances or grant purchased items.

| Decision | Status |
|---|---|
| Item catalog and initial prices | TBD |
| Shop categories and sorting | TBD |
| Purchase quantity limits | TBD |
| Whether placed decorations can be sold or returned | TBD |
| Refund rules for accidental purchases | TBD |

### 4.6 Coins and Rewards

Coins are the primary in-game currency.

**Starting balance:** Enough to purchase several basic fish and decorations. Exact amount TBD.

**Planned coin sources:**

| Source | Status |
|---|---|
| Daily login rewards | Confirmed |
| Quests and achievements | Confirmed |
| Collection milestone rewards | Confirmed |
| Selling eligible fish or items | Confirmed |
| Passive income over time | Confirmed (details TBD) |

All reward sources must be designed to avoid duplicate claims, unintended currency generation, and easy exploitation.

> **TBD:** Passive income source, accumulation rate, storage limit, collection process, and offline behavior.

Selling fish or items must respect ownership and placement state. The game must not allow selling an item the player no longer owns or selling the same item multiple times.

### 4.7 Quests and Achievements

Quests and achievements provide objectives and rewards.

Potential objectives (proposed, not finalized):

- Place the first fish in the aquarium.
- Purchase a decoration.
- Feed a fish.
- Hatch an egg.
- Collect fish from different rarity tiers.
- Reach a collection milestone.

Quest completion and reward claims must be validated on the server. Repeated requests must not grant duplicate rewards.

### 4.8 Fish Eggs

Fish eggs are a separate acquisition and progression system.

**Confirmed decisions:**

- Eggs hatch after a period of real-world time.
- Eggs can be purchased using coins.
- Eggs can be awarded through quests and other rewards.
- Collection milestones can grant eggs.
- Players can receive free eggs periodically.

**Proposed lifecycle:**

```
Available → Owned → Incubating → Ready to Hatch → Hatched
```

| Decision | Status |
|---|---|
| Incubation duration | TBD |
| Whether different egg types produce different fish | TBD |
| Whether fish species is predetermined or randomized | TBD |
| Whether egg rarity influences hatch outcomes | TBD |
| Whether eggs can be sold or transferred | TBD |
| Free egg reward intervals and eligibility | TBD |
| Whether players must manually claim the hatched fish | TBD |
| Whether eggs must be placed in a particular aquarium location | TBD |

> **Constraint:** Hatching must be calculated using authoritative server timestamps rather than relying on the client's clock or requiring the game to remain open.

### 4.9 Fish Rarity

The game uses five rarity tiers:

| Tier | Description |
|---|---|
| Common | Frequently available, lower value |
| Uncommon | Moderately available |
| Rare | Less available, higher value |
| Epic | Scarce, high value |
| Legendary | Very rare, may require specific conditions |

Rarity may influence shop availability, price, collection milestones, and progression requirements.

> **Do not assume** that rarity automatically determines fish size, care difficulty, or aquarium capacity requirements.

### 4.10 Progression and Unlocks

Content can be unlocked through:

- Direct purchase using coins.
- Player level or progression milestones.
- Quest completion.

The leveling formula, experience sources, level cap, and unlock table have not been finalized.

Progression should introduce content gradually without making the initial experience unnecessarily restrictive.

---

## 5. Economy and Business Rules

The economy should support a sustainable loop between acquiring resources, collecting fish, and customizing the aquarium.

### Required Rules

1. The server is authoritative for coin balances and purchases.
2. A purchase must atomically deduct the correct amount and grant the item.
3. A failed purchase must not deduct coins without granting the item.
4. Rewards must be idempotent where repeated requests could otherwise grant duplicates.
5. Every currency change should have an auditable transaction record.
6. Selling an item must update ownership and currency consistently.
7. Egg hatching must not create multiple fish from the same egg.
8. Client-supplied prices, balances, reward amounts, and rarity outcomes must not be trusted.

### Economy Values Awaiting Balancing

| Parameter | Status |
|---|---|
| Starting coins | TBD |
| Basic fish prices | TBD |
| Decoration prices | TBD |
| Egg prices | TBD |
| Daily login rewards | TBD |
| Quest rewards | TBD |
| Collection milestone rewards | TBD |
| Selling prices | TBD |
| Passive income rate | TBD |
| Aquarium expansion costs | TBD |

No numerical economy values should be treated as approved until explicitly decided.

---

## 6. Accounts and Persistence

**Confirmed:** Players log in and save their progress on the server.

Persistent data requirements (logical, not a finalized schema):

- Player account and progression.
- Coin balance and transaction history.
- Owned fish and items.
- Fish currently placed in the aquarium.
- Fish care state.
- Egg ownership and incubation state.
- Quest progress and reward claims.
- Aquarium layout and capacity.

The technical design must distinguish item ownership from item placement. It must also define how to restore an aquarium consistently when a player returns.

---

## 7. UX Requirements

- The aquarium is the primary destination after entering the game.
- Essential controls should be discoverable without extensive tutorials.
- Shop, inventory, fish care, and decoration management must be accessible from the aquarium.
- Important actions should provide clear feedback.
- Purchases and irreversible actions should communicate their consequences.
- Mobile controls must not depend on hover.
- Layout editing should support easy placement and precise adjustments.
- Care indicators should communicate status clearly without overwhelming the aquarium view.
- Loading, saving, empty inventory, insufficient coins, and failed actions need appropriate states.

> **TBD:** Guided onboarding experience — its exact design and scope are not yet defined.

---

## 8. Prototype Scope

The first interactive 3D prototype must include:

| Element | Requirement |
|---|---|
| Aquarium scene | One complete scene |
| Fish | 3–5 fish with natural-looking swimming animation |
| Environment | Aquatic plants, rocks, and decorative objects |
| UI | Sample shop and inventory UI |
| Interaction | Placement and movement of aquarium objects |
| Camera | Zoom and viewing-angle adjustment |
| Platform testing | Desktop and mobile interaction validation |

The prototype may use temporary or existing assets. Production-quality models and the full economy do not need to be completed before visual and performance validation.

> **Not required for prototype:** Authentication, PostgreSQL persistence, real purchases, or the complete reward system.

---

## 9. Out of Scope

The following are excluded from the MVP:

- Fishing gameplay, rods, bait, and fishing locations.
- Multiplayer.
- Player-to-player trading.
- Complex social systems.
- Paid currency and monetization.
- Large-scale live-service infrastructure.
- Expensive or unnecessary physical simulations.

Fishing may be considered after the aquarium experience and core progression have been validated.

---

## 10. Acceptance Criteria

### Aquarium

- The scene renders correctly on supported desktop and mobile browsers.
- Multiple fish swim without requiring per-frame database updates.
- Players can place, move, rotate, and remove supported objects.
- Aquarium layouts persist and restore correctly.

### Economy

- Starting coins are granted correctly.
- Valid purchases deduct coins and grant items exactly once.
- Insufficient funds prevent purchases.
- Failed transactions do not leave currency and inventory inconsistent.
- Selling cannot duplicate currency or sell unowned items.

### Fish Care and Eggs

- Care state persists correctly.
- Care consequences follow explicitly approved rules.
- Eggs hatch according to server-validated timing.
- One egg cannot produce multiple fish.
- Rewards cannot be claimed repeatedly to exploit the economy.

### Progression and Rewards

- Quest and collection progress is saved.
- Unlock requirements are enforced.
- Daily rewards follow the approved reset policy.
- Passive income follows the approved accrual and collection rules.

### Quality

- Authentication and authorization are tested.
- Desktop and mobile interactions are usable.
- Performance is measured on representative devices.
- Relevant tests and builds are executed and their actual results reported.

> Any criterion dependent on a TBD decision must be finalized before that feature can be considered complete.

---

## 11. Open Decisions

The following decisions require explicit resolution before the corresponding systems are fully implemented:

1. Exact fish care indicators, decay rates, and health consequences.
2. Feeding frequency and feeding costs.
3. Starting coin balance and item prices.
4. Passive income formula and offline behavior.
5. Egg incubation durations and hatch outcomes.
6. Free egg reward frequency.
7. Fish catalog and initial content quantity.
8. Aquarium capacity and expansion rules.
9. Quest catalog, rewards, and progression formula.
10. Selling rules and prices.
11. Object placement constraints and collision behavior.
12. Detailed data schema and API contracts.
13. Final art references and asset sources.
14. Supported browsers and representative performance test devices.

These are also tracked in [decisions/README.md](decisions/README.md).

---

## 12. Current Product Decisions Summary

### Confirmed

- Aquarium-first game.
- Semi-realistic 3D visual direction.
- One aquarium in the MVP.
- Fixed default camera with zoom and adjustable viewing angle.
- Hybrid easy placement and precision editing.
- Fish feeding, interaction, and care management.
- Five rarity tiers (Common, Uncommon, Rare, Epic, Legendary).
- Coin-based shop purchases.
- Quests, daily rewards, collection milestones, item sales, and passive income as planned reward sources.
- Real-time egg hatching.
- Eggs obtainable through purchases, rewards, collection milestones, and periodic free rewards.
- Login and server-side persistence.
- Desktop and mobile web have equal priority.
- Free-to-play MVP without monetization.
- Fishing and multiplayer are out of scope.

### Proposed Implementation Order

Aquarium prototype → persistence and inventory → shop and decoration → fish care and progression → eggs and reward economy → QA and release.

**Status:** Ready for technical review and refinement. Detailed balancing and unresolved gameplay rules must be finalized before their implementation.
