# Fishora MVP: Database Schema, Game Backend and UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the BA MVP spec into a server-authoritative game: the full Postgres schema, the rules engine (care simulation, fish lifecycle, rewards, shop, fishing, progression, admin), and the UI screens that drive it on top of the existing R3F aquarium.

**Architecture:** Every player mutation runs through one entry point, `withPlayer()`. It opens a Prisma interactive transaction, takes a row lock on the player (`SELECT … FOR UPDATE` on `users`), advances the world to "now" (offline tank simulation, revive expiry, stale-trip cancel), runs the action, and records the idempotency result. That one lock serialises each player's requests, so ticks, coins and claims can't be double-processed. Game rules are pure functions in `lib/game/**` that take their config as an argument. All tunable numbers live in DB config/content tables, never in code. The UI is a set of overlay screens (React + CSS modules from the existing kit) over the 3D tank. It reads one bootstrap snapshot (`GET /api/state`) and calls REST routes.

**Tech Stack:** Next.js 15 Route Handlers, Prisma 6 on Neon Postgres, React 19 + R3F 9, Vitest 5 (unit + DB integration), Playwright (E2E, added in Task 21).

**Spec:** `docs/specs/2026-10-22-fishora-ba-mvp.md` (BA MVP tổng hợp, 22/10/2026). Section references below (§n) point into it.

## Global Constraints

- The BA spec supersedes R-002 and R-008 in `docs/decisions/README.md`: fishing is in the MVP. Eggs/breeding and gameplay decor are out (§1). Task 21 updates the tracker.
- **No invented balance numbers in code (§15).** Every TBD value is a field in `game_config` or in a content table (`species`, `item_defs`, `zones`, `upgrade_levels`, `quest_templates`, `achievement_defs`). Dev values live only in `prisma/seed/placeholder-balance.ts`, a file whose header says `PLACEHOLDER — not balanced, see spec §15`.
- Values the spec *does* fix go in `lib/game/rules.ts` as constants: `REVIVE_WINDOW_DAYS = 14`, `RELEASE_RATIO = 0.25`, `SELL_RATIO = 1`, `MAX_REVIVES = 1`, `BAIT_PER_CAST = 1`.
- Formula *shapes* for TBD formulas (linear, config-scaled) are defined in this plan and recorded as "Assumed" decisions in Task 21. Only their coefficients are config.
- Weights are integer **grams**, coins are integers, HP is an integer `0..care.hpMax`. No floats are persisted for game quantities except multipliers in config JSON.
- Rarity enum: `common | uncommon | rare | epic | legendary` (§3.3).
- Timestamps come from the DB clock (existing convention). Rule code takes `now: Date` as a parameter so tests can move time; routes pass `await dbNow(tx)`.
- Every event stores both `occurredAt` (simulated game time) and `processedAt` (DB time of processing) (§11 design note).
- Nothing with business meaning is hard-deleted (§16.4): fish, sales, claims, ledger, change logs, trips. Species and milestones use `deletedAt`.
- Every mutating route requires an `Idempotency-Key` header (≤ 100 chars), as `app/api/care/water-change/route.ts` does today. Missing → 400 `missing_idempotency_key`.
- API errors are `{ error: <code> }`. The codes used in this plan are `insufficient_coins` 409, `insufficient_items` 409, `storage_full` 409, `item_storage_full` 409, `tank_full` 409, `not_found` 404, `invalid_input` 400, `forbidden` 403, `level_too_low` 409, `zone_locked` 409, `trip_not_active` 409, `gear_broken` 409, `no_bait` 409, `cooler_full` 409, `revive_unavailable` 409, `species_inactive` 409.
- Gameplay requires sign-in. Signed out, the page keeps today's local demo tank (`useGameState` guest path) and the Dock shows a sign-in prompt.
- UI copy goes through `lib/i18n.tsx` in both `en` and `vi`. UI is built from `components/ui` (Panel, Button, Badge, ProgressBar + the additions in Task 14). It must work at 375px width, and colour never carries meaning alone (existing kit rule).
- Tests use config profile `test`: `game_config` is keyed by `(profile, key)`, the loader reads `process.env.FISHORA_CONFIG_PROFILE ?? 'live'`, and `tests/setup.ts` sets `test`. Test content rows use keys prefixed `t_` and are created by `tests/fixtures/content.ts`.
- Existing dev data: the migration drops `inventory_items` rows with `kind = 'fish'` (pre-release dev accounts only). Decor rows and layout stay untouched. The starting grant moves to config `starter`.
- Files keep LF line endings.

## Review Focus

- Two tabs or two devices loading the game at the same moment must not process the same offline ticks twice or consume food twice → concurrent `advanceWorld` test in Task 6.
- A client retrying a POST after a timeout (same `Idempotency-Key`) for buy / sell-batch / claim must get the first response and not pay or credit twice → retry tests in Tasks 3, 8, 9, 10.
- A fish that dies mid-way through an offline window while auto-feed has food for only some fish: the dead fish is never fed or charged food afterwards, and the remaining food goes to living fish → sim test in Task 5.
- The tab closes while "Về nhà" is in flight: return and cancel race, and exactly one wins. Kept fish are never both in storage and abandoned → race test in Task 11.
- A player who comes back after the 14-day revive deadline must see the fish as lost with `lostAt` = deadline, not processing time. A revive request racing that expiry must fail → tests in Tasks 6 and 10.

---

## Database Schema

This is the target `prisma/schema.prisma` after Task 1. It is the main design decision of this plan, so it is written out in full. Existing models `User`, `CoinTransaction` and `InventoryItem` stay; `User` gains columns.

```prisma
enum UserRole     { player admin }
enum Rarity       { common uncommon rare epic legendary }
enum Sex          { male female }
enum FishLocation { storage tank trip none }          // none = dead/ended, occupies nothing
enum FishStatus   { alive dead lost sold released abandoned }
enum TripStatus   { active completed cancelled }
enum ClaimSource  { milestone maturity quest achievement login }
enum PartKind     { coins exp item }
enum PartStatus   { pending claimed void }
enum StackBucket  { main reserve }                   // reserve = tank auto-feeder hopper (§4.3)

model User {                                          // + existing fields
  role          UserRole @default(player)
  level         Int      @default(1)
  exp           Int      @default(0)
  loginStreak   Int      @default(0)
  lastLoginDay  String?                               // dayKey 'YYYY-MM-DD' in game timezone
}

// ---------- configuration & content (admin-editable, §12) ----------
model GameConfig {
  profile   String   @default("live")
  key       String                                    // see lib/game/config.ts CONFIG_SECTIONS
  value     Json
  updatedAt DateTime @default(dbgenerated("CURRENT_TIMESTAMP")) @updatedAt
  updatedBy String?
  @@id([profile, key])
  @@map("game_config")
}

model Species {
  key                    String    @id                // immutable internal id (§6.4)
  displayName            String
  rarity                 Rarity
  modelKey               String                       // TANK_FISH id in lib/fishSpecies.ts used to render
  maxWeightGrams         Int
  spawnWeightMinGrams    Int
  spawnWeightMaxGrams    Int
  spawnAgeMinDays        Int
  spawnAgeMaxDays        Int
  growthGramsPerTick     Int
  foodUnitsPerFeed       Int
  valuePerKg             Int                          // base value formula input
  buyPrice               Int?                         // null = not sold directly
  maturityReward         Json                         // RewardBundle
  maturitySaleBonusCoins Int       @default(0)
  maturitySaleBonusPct   Int       @default(0)        // whole percent of base value
  active                 Boolean   @default(true)
  deletedAt              DateTime?
  version                Int       @default(1)
  @@map("species")
}

model SpeciesChangeLog {
  id              String   @id @default(cuid())
  speciesKey      String
  adminId         String
  kind            String                              // create|update|rename|deactivate|activate|soft_delete
  before          Json?
  after           Json
  affectedFishIds Json                                // string[]
  createdAt       DateTime @default(dbgenerated("CURRENT_TIMESTAMP"))
  @@index([speciesKey, createdAt])
  @@map("species_change_log")
}

model Milestone {
  id          String    @id @default(cuid())
  speciesKey  String?                                 // null = default set; a species with ≥1 live own milestone ignores defaults
  weightGrams Int
  reward      Json                                    // RewardBundle
  createdAt   DateTime  @default(dbgenerated("CURRENT_TIMESTAMP"))
  deletedAt   DateTime?
  @@index([speciesKey])
  @@map("milestones")
  // migration SQL: UNIQUE (COALESCE("speciesKey",''), "weightGrams") WHERE "deletedAt" IS NULL
}

model MilestoneChangeLog {
  id               String   @id @default(cuid())
  milestoneId      String
  adminId          String
  kind             String                             // create|update|delete
  before           Json?
  after            Json?
  pendingPolicy    String?                            // keep|replace (§6.2)
  affectedClaimIds Json
  createdAt        DateTime @default(dbgenerated("CURRENT_TIMESTAMP"))
  @@map("milestone_change_log")
}

model ItemDef {
  key         String  @id
  category    String                                  // food|bait|cleaning|revive|blindbox|rod|line|hook|cooler
  name        String
  stackable   Boolean                                 // false for rod/line/hook/cooler (gear_items)
  price       Int?                                    // null = not in shop (revive items, §5.2)
  shopVisible Boolean @default(true)
  stats       Json                                    // per-category, see lib/game/items.ts ItemStats
  active      Boolean @default(true)
  @@map("item_defs")
}

model BlindboxEntry {
  boxKey     String
  speciesKey String
  weight     Int
  @@id([boxKey, speciesKey])
  @@map("blindbox_entries")
}

model Zone {
  key        String  @id
  name       String
  minLevel   Int
  unlockCost Int
  missWeight Int                                      // weight of "no bite" in the cast roll
  sortOrder  Int
  active     Boolean @default(true)
  @@map("zones")
}

model ZoneSpecies {
  zoneKey    String
  speciesKey String
  weight     Int
  @@id([zoneKey, speciesKey])
  @@map("zone_species")
}

model UpgradeLevel {
  track          String                               // tank_capacity|tank_care|storage_fish|storage_items
  level          Int                                  // level 0 = starting value
  cost           Int
  minPlayerLevel Int
  value          Json                                 // {maxFish}|{autoFeed,autoClean}|{maxGrams}|{slots}
  @@id([track, level])
  @@map("upgrade_levels")
}

model QuestTemplate {
  key      String  @id
  metric   String                                     // stat metric that advances it (lib/game/progression.ts METRICS)
  target   Int
  minLevel Int
  requires Json                                       // {tankFish?:true, zoneKey?:string}
  reward   Json
  active   Boolean @default(true)
  @@map("quest_templates")
}

model AchievementDef {
  key       String @id
  metric    String
  threshold Int
  reward    Json
  sortOrder Int
  @@map("achievement_defs")
}

// ---------- player state ----------
model Tank {
  userId          String    @id
  dirt            Int       @default(0)
  simulatedUntil  DateTime                            // ticks before this instant are processed (§11)
  autoFeed        Boolean   @default(false)
  autoClean       Boolean   @default(false)
  autoFeedItemKey String?
  lastAutoCleanAt DateTime?
  @@map("tanks")
}

model Fish {
  id                     String       @id @default(cuid())
  userId                 String
  speciesKey             String
  nickname               String?
  sex                    Sex
  rarity                 Rarity                       // copied from species at creation
  weightGrams            Int
  hp                     Int
  satietyTicks           Int          @default(0)
  growthMult             Float        @default(1)     // from the last food tier eaten
  ageDays                Int
  daysInTank             Int          @default(0)
  baseValue              Int                          // fixed at creation (§3.2)
  location               FishLocation
  status                 FishStatus   @default(alive)
  tripId                 String?
  origin                 String                       // starter|shop|blindbox|fishing|reward
  acquiredAt             DateTime     @default(dbgenerated("CURRENT_TIMESTAMP"))
  diedAt                 DateTime?
  reviveDeadline         DateTime?
  revivedAt              DateTime?
  endedAt                DateTime?                    // sold/released/lost/abandoned instant
  maturedAt              DateTime?                    // first maturity
  maturitySaleBonusCoins Int?                         // snapshot at first maturity (§6.3)
  maturitySaleBonusPct   Int?
  @@index([userId, location, status])
  @@index([speciesKey, status])
  @@map("fish")
  // migration SQL: CHECK (hp >= 0), CHECK ("weightGrams" > 0)
}

model FishEvent {
  id          String   @id @default(cuid())
  fishId      String
  userId      String
  type        String       // acquired|moved|renamed|fed|starved|died|revived|lost|matured|milestone|sold|released|abandoned
  data        Json     @default("{}")
  occurredAt  DateTime
  processedAt DateTime @default(dbgenerated("CURRENT_TIMESTAMP"))
  @@index([fishId, occurredAt])
  @@map("fish_events")
}

model FishSale {
  fishId        String   @id                          // PK = each fish sold/released once (§6.3, §13)
  userId        String
  mode          String                                // sell|release
  coins         Int
  maturityBonus Int      @default(0)
  batchId       String
  createdAt     DateTime @default(dbgenerated("CURRENT_TIMESTAMP"))
  @@index([userId, createdAt])
  @@map("fish_sales")
}

model InventoryStack {
  userId  String
  itemKey String
  bucket  StackBucket @default(main)
  qty     Int                                         // CHECK qty >= 0
  @@id([userId, itemKey, bucket])
  @@map("inventory_stacks")
}

model GearItem {
  id            String   @id @default(cuid())
  userId        String
  defKey        String
  durability    Int                                   // CHECK 0..maxDurability
  maxDurability Int
  acquiredAt    DateTime @default(dbgenerated("CURRENT_TIMESTAMP"))
  @@index([userId])
  @@map("gear_items")
}

model GearLoadout {
  userId   String  @id
  rodId    String?
  lineId   String?
  hookId   String?
  coolerId String?
  baitKey  String?
  @@map("gear_loadouts")
}

model UserUpgrade {
  userId String
  track  String
  level  Int
  @@id([userId, track])
  @@map("user_upgrades")
}

model UnlockedZone {
  userId     String
  zoneKey    String
  unlockedAt DateTime @default(dbgenerated("CURRENT_TIMESTAMP"))
  @@id([userId, zoneKey])
  @@map("unlocked_zones")
}

model FishingTrip {
  id         String     @id @default(cuid())
  userId     String
  zoneKey    String
  status     TripStatus @default(active)
  startedAt  DateTime   @default(dbgenerated("CURRENT_TIMESTAMP"))
  lastSeenAt DateTime   @default(dbgenerated("CURRENT_TIMESTAMP"))
  endedAt    DateTime?
  endReason  String?                                  // returned|closed|timeout
  @@index([userId, status])
  @@map("fishing_trips")
  // migration SQL: UNIQUE ("userId") WHERE status = 'active'
}

model RewardClaim {
  id          String      @id @default(cuid())
  userId      String
  source      ClaimSource
  sourceRef   String      // milestone: "<fishId>:<weightGrams>", maturity: fishId, quest: playerQuestId, achievement: key, login: dayKey
  fishId      String?
  createdAt   DateTime    @default(dbgenerated("CURRENT_TIMESTAMP"))
  completedAt DateTime?                               // all parts claimed or void (§6.1)
  parts       RewardClaimPart[]
  @@unique([userId, source, sourceRef])
  @@map("reward_claims")
}

model RewardClaimPart {
  id        String      @id @default(cuid())
  claimId   String
  kind      PartKind
  itemKey   String?
  qty       Int
  status    PartStatus  @default(pending)
  claimedAt DateTime?
  claim     RewardClaim @relation(fields: [claimId], references: [id])
  @@index([claimId])
  @@map("reward_claim_parts")
}

model FishMilestone {
  fishId      String
  weightGrams Int                                     // PK on weight, not milestone id: recreated same weight can't pay twice (§6.2)
  milestoneId String
  claimId     String
  reachedAt   DateTime
  @@id([fishId, weightGrams])
  @@map("fish_milestones")
}

model PlayerQuest {
  id          String    @id @default(cuid())
  userId      String
  dayKey      String
  templateKey String
  progress    Int       @default(0)
  target      Int
  completedAt DateTime?
  @@unique([userId, dayKey, templateKey])
  @@map("player_quests")
}

model DailyLogin {
  userId String
  dayKey String
  streak Int
  @@id([userId, dayKey])
  @@map("daily_logins")
}

model PlayerAchievement {
  userId         String
  achievementKey String
  completedAt    DateTime
  @@id([userId, achievementKey])
  @@map("player_achievements")
}

model PlayerStat {
  userId String
  metric String
  value  Int
  @@id([userId, metric])
  @@map("player_stats")
}

model SpeciesDiscovery {
  userId     String
  speciesKey String
  via        String
  firstAt    DateTime @default(dbgenerated("CURRENT_TIMESTAMP"))
  @@id([userId, speciesKey])
  @@map("species_discoveries")
}

model ExpGrant {
  id        String   @id @default(cuid())
  userId    String
  source    String
  dayKey    String
  amount    Int
  createdAt DateTime @default(dbgenerated("CURRENT_TIMESTAMP"))
  @@index([userId, source, dayKey])
  @@map("exp_grants")
}

model Operation {                                     // idempotency record for multi-effect requests
  userId    String
  key       String
  kind      String
  result    Json
  createdAt DateTime @default(dbgenerated("CURRENT_TIMESTAMP"))
  @@id([userId, key])
  @@map("operations")
}
```

All player-owned tables get `userId` FK to `users(id) ON DELETE CASCADE` (test cleanup relies on it); add the `@relation` fields in the real file. Content FKs (`fish.speciesKey → species.key`, `zone_species`, `blindbox_entries`, `gear_items.defKey`) are `ON DELETE RESTRICT`.

**Shared JSON types** (`lib/game/types.ts`):
`RewardBundle = { coins?: number; exp?: number; items?: { itemKey: string; qty: number }[] }`.

## File Structure

| Path | Responsibility |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/2026…_mvp_core/` | Schema above + raw SQL constraints |
| `prisma/seed/placeholder-balance.ts`, `prisma/seed/index.ts` | Dev content + `live` config (PLACEHOLDER) |
| `lib/game/rules.ts` | Spec-fixed constants |
| `lib/game/types.ts` | RewardBundle, ItemStats, snapshot DTOs |
| `lib/game/config.ts` | Typed config loader per profile |
| `lib/game/tx.ts` | `withPlayer`, `GameError`, `dbNow`, `dayKey` |
| `lib/game/rng.ts` | `Rng`, `cryptoRng`, `seededRng`, `pickWeighted`, `shuffle` |
| `lib/game/ledger.ts` | `adjustCoins` (replaces `spendCoins` internals) |
| `lib/game/storage.ts` | Fish/item capacity, stack and gear grant/take |
| `lib/game/fish/formulas.ts` | Pure: value, maturity, revive cost, sale amount, milestone eligibility |
| `lib/game/fish/create.ts` | `createFish` |
| `lib/game/sim/simulate.ts` | Pure offline tick engine |
| `lib/game/sim/advance.ts` | `advanceWorld`: load → simulate → persist |
| `lib/game/rewards.ts` | Claims, growth rewards |
| `lib/game/care.ts` | Manual feed/clean, auto-care, reserve, move, rename |
| `lib/game/shop.ts`, `lib/game/sell.ts`, `lib/game/revive.ts`, `lib/game/upgrades.ts` | Economy actions |
| `lib/game/fishing/*.ts` | Zones, loadout, trips, cast, repair |
| `lib/game/progression.ts` | EXP/levels, stats, quests, login, achievements |
| `lib/game/admin/*.ts` | Species + milestone admin with change logs |
| `lib/game/snapshot.ts` | Builds `GET /api/state` payload |
| `app/api/**` | Thin route handlers |
| `lib/client/api.ts`, `lib/client/GameProvider.tsx` | Client fetch + game store |
| `components/ui/*` | Kit additions: Modal, Drawer, Tabs, Field, Stepper, Countdown, Confirm |
| `components/hud/TopBar.tsx`, `components/hud/Dock.tsx` | HUD chrome |
| `components/screens/{tank,storage,shop,fishing,rewards,collection}/*` | Game screens |
| `app/admin/**`, `components/admin/*` | Admin pages |
| `tests/game/**`, `tests/fixtures/content.ts` | Unit + integration tests |
| `e2e/*.spec.ts`, `playwright.config.ts` | E2E |

---

## Phase A — Data foundation

### Task 1: Schema, migration and seed

**Files:**
- Modify: `prisma/schema.prisma`, `lib/game/catalog.ts` (drop `startingFish`, `STARTING_COINS`), `lib/auth/service.ts` (starter grant moves to Task 3's `grantStarter`; for now only create the user + `Tank` row)
- Create: `prisma/migrations/<ts>_mvp_core/migration.sql`, `prisma/seed/placeholder-balance.ts`, `prisma/seed/index.ts`, `lib/game/rules.ts`, `lib/game/types.ts`, `tests/fixtures/content.ts`, `tests/game/schema.test.ts`
- Modify: `package.json` (`"db:seed": "node --env-file=.env.local --import tsx prisma/seed/index.ts"`, add devDependency `tsx`), `tests/setup.ts` (`process.env.FISHORA_CONFIG_PROFILE = 'test'`)

**Interfaces:**
- Produces: all Prisma models above. `seedTestContent(): Promise<void>` and `TEST_SPECIES = { small: 't_guppy', big: 't_arowana' }` in `tests/fixtures/content.ts`; it upserts `t_` species/items/zones/upgrades/quests/achievements and the full `test` config profile with small deterministic numbers.

- [ ] **Step 1: Write the failing test** `tests/game/schema.test.ts`:
  - `test('coins cannot go negative')`: raw `UPDATE users SET coins = -1` rejects.
  - `test('a fish can be sold only once')`: second `fishSale.create` with the same `fishId` throws P2002.
  - `test('only one active trip per user')`: second active `fishingTrip.create` throws; a `completed` one succeeds.
  - `test('one live milestone per species+weight')`: duplicate live row throws; after setting `deletedAt` on the first, a new one succeeds.
  - `test('stack qty cannot go negative')`.
- [ ] **Step 2:** `npm test -- tests/game/schema.test.ts` → FAIL (models missing).
- [ ] **Step 3:** Write the schema and run `npm run db:migrate -- --name mvp_core --create-only`. Append to the SQL: the CHECKs (`fish.hp >= 0`, `fish.weightGrams > 0`, `inventory_stacks.qty >= 0`, `gear_items.durability BETWEEN 0 AND "maxDurability"`), the two partial unique indexes, and `DELETE FROM inventory_items WHERE kind = 'fish';`. Then apply with `npm run db:migrate`. Registration creates `Tank { simulatedUntil: now }` inside the existing `user.create`.
- [ ] **Step 4:** Write `placeholder-balance.ts`: the `live` config for every section in Task 2's `GameConfig`, 5 species mapped to existing `modelKey`s (`betta`, `tuna`, …), food tiers ×3, bait ×2, cleaning ×2, one revive item (price null), one blindbox, rod/line/hook/cooler ×2 each, 3 zones, upgrade levels 0–3 per track, 4 quest templates, 4 achievements (§10.4 examples), default milestones. Then `npm run db:seed`.
- [ ] **Step 5:** `npm test` → all PASS, including the existing auth/wallet suites (fix `service.test.ts` expectations that referenced starter fish).
- [ ] **Step 6: Commit** `feat(db): MVP core schema, constraints and placeholder seed`

### Task 2: Config loader, RNG, time helpers

**Files:**
- Create: `lib/game/config.ts`, `lib/game/rng.ts`, `tests/game/config.test.ts`, `tests/game/rng.test.ts`
- Create part of `lib/game/tx.ts`: `dayKey`, `nextDayBoundary`

**Interfaces:**
- Produces:
  - `type GameConfig = { time: { timezone: string; resetHour: number }; care: CareConfig; value: ValueConfig; revive: { hpRatio: number; costBase: Record<Rarity, number>; costPerAgeDay: number; itemKey: string }; fishing: FishingConfig; exp: ExpConfig; login: { rewards: RewardBundle[] }; quests: { perDay: number }; starter: { coins: number; fish: string[]; items: { itemKey: string; qty: number }[]; gear: string[] } }`
  - `type CareConfig = { tickMinutes: number; hpMax: number; feedSatietyTicks: number; hpPerFeed: number; hungerHpLossPerTick: number; hungerWeightLossRatio: number; dirtBasePerTick: number; dirtPerFishPerTick: number; dirtMax: number; dirtThresholds: { at: number; hpLossPerTick: number; weightLossRatio: number }[]; autoCleanEarlyAt: number; autoCleanItemKey: string; autoCleanItemQty: number; autoCleanEffect: number; cleaningLevels: { key: string; coins?: number; itemKey?: string; itemQty?: number; dirtReduction: number }[] }`
  - `type ValueConfig = { rarityMult: Record<Rarity, number>; perAgeDay: number }`
  - `type FishingConfig = { tripTimeoutSec: number; catchDurabilityLoss: number; fightFailDurabilityLoss: number; incompatibleExtraLoss: number; compatibleTierSpread: number; fightBaseSuccess: number; repairCostPerPoint: number }`
  - `type ExpConfig = { levelThresholds: number[]; sources: Record<string, { exp: number; dailyCap: number | null }> }`
  - `loadConfig(db: Tx | PrismaClient, profile?: string): Promise<GameConfig>`: throws `Error('config_missing:<key>')` if a section is absent.
  - `type Rng = () => number`; `cryptoRng: Rng`; `seededRng(seed: number): Rng` (mulberry32); `pickWeighted<T>(entries: { value: T; weight: number }[], rng: Rng): T`; `shuffle<T>(xs: readonly T[], rng: Rng): T[]`
  - `dayKey(at: Date, tz: string, resetHour: number): string`; `nextDayBoundary(at: Date, tz: string, resetHour: number): Date`

- [ ] **Step 1: Failing tests:**
  - `loadConfig` returns the `test` profile and throws `config_missing:care` after that row is deleted (restore in `afterEach`).
  - `pickWeighted` with `seededRng(1)` over 10 000 draws of weights 1:3 lands within 0.72–0.78 for the heavier one. Weight 0 is never picked.
  - `dayKey(new Date('2026-10-22T16:59:59Z'), 'Asia/Ho_Chi_Minh', 0) === '2026-10-22'` and `…17:00:00Z` → `'2026-10-23'`. With `resetHour 5`, `'2026-10-22T21:59:59Z'` → `'2026-10-22'`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Use `Intl.DateTimeFormat` with `timeZone` for `dayKey`. No timezone library.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(game): typed config loader, seeded RNG, day keys`

### Task 3: Transaction core — withPlayer, ledger, storage, idempotency

**Files:**
- Create: `lib/game/ledger.ts`, `lib/game/storage.ts`, finish `lib/game/tx.ts`
- Modify: `lib/game/wallet.ts` (`spendCoins` becomes a wrapper over `withPlayer` + `adjustCoins`, same signature/results so `water-change` keeps working), `lib/auth/service.ts` (call `grantStarter` in the register transaction), `lib/api.ts` (add `requireIdempotencyKey(req)`, `gameRoute(handler)` that maps `GameError` → JSON)
- Test: `tests/game/tx.test.ts`, `tests/game/storage.test.ts`

**Interfaces:**
- Produces:
  - `type Tx = Prisma.TransactionClient`
  - `class GameError extends Error { constructor(public code: string, public status: number, public detail?: unknown) }`
  - `withPlayer<T>(userId: string, fn: (tx: Tx, ctx: { now: Date; cfg: GameConfig; rng: Rng }) => Promise<T>, opts?: { idempotencyKey?: string; kind?: string; now?: Date; rng?: Rng; skipAdvance?: boolean }): Promise<T>`. Order: begin tx (timeout 20 s) → `SELECT id FROM users WHERE id=$1 FOR UPDATE` → if `idempotencyKey` and an `operations` row exists, return its `result` → `advanceWorld(tx, userId, now, cfg, rng)` (no-op stub until Task 6) → `fn` → insert `operations` row with the JSON result → commit. A `GameError` rolls back and is rethrown.
  - `dbNow(tx: Tx): Promise<Date>`
  - `adjustCoins(tx: Tx, userId: string, delta: number, reason: string): Promise<number>`: one conditional UPDATE + ledger insert. Throws `GameError('insufficient_coins', 409)` when the result would be < 0.
  - `fishStorage(tx, userId): Promise<{ usedGrams: number; maxGrams: number }>`: alive fish with `location = storage`.
  - `assertFishStorage(tx, userId, addGrams: number): Promise<void>`: throws `storage_full` with `detail: { needGrams, freeGrams }`.
  - `itemSlots(tx, userId): Promise<{ used: number; max: number }>`: one slot per `main` stack with `qty > 0` plus one per gear item. Reserve stacks don't count.
  - `tryGrantItem(tx, userId, itemKey: string, qty: number): Promise<boolean>`: adding to an existing main stack always fits. A new stack or gear piece needs a free slot (gear: creates `qty` `GearItem`s at `stats.maxDurability`). Returns false and writes nothing if it doesn't fit.
  - `grantItemOrThrow(...)`: same, but throws `item_storage_full`.
  - `takeItem(tx, userId, itemKey, qty, bucket: 'main' | 'reserve' = 'main'): Promise<void>`: throws `insufficient_items`.
  - `tankCapacity(tx, userId): Promise<{ used: number; max: number }>`, `careLevel(tx, userId): Promise<{ autoFeed: boolean; autoClean: boolean }>`, both from `user_upgrades` + `upgrade_levels` (missing row = level 0).
  - `grantStarter(tx, userId, cfg)`: coins via ledger reason `starting_grant`, `createFish` for each `starter.fish` into the tank, items, gear, and an empty `GearLoadout`. It runs inside registration, so the `createFish` dependency means this function lands at the end of Task 4.
  - Stub file `lib/game/progression.ts` exporting the final signatures of `bumpStat` and `grantExp` (Task 12) as no-ops, so Tasks 4–11 can call them. Task 12 replaces the bodies.

- [ ] **Step 1: Failing tests** (`tests/game/tx.test.ts`):
  - `same idempotency key returns stored result and runs fn once`: 5 parallel `withPlayer` calls with one key and `fn` = `adjustCoins(-5)` → balance drops by 5 once, all 5 results are equal.
  - `GameError inside fn rolls back coins and leaves no operation row`.
  - `concurrent different keys serialise`: 60 × `adjustCoins(-5)` from 250 → 50 ok, balance 0 (reuses the wallet test idea through `withPlayer`).
  - `storage.test.ts`: `assertFishStorage` throws `storage_full` with exact `needGrams/freeGrams`; `tryGrantItem` onto an existing stack succeeds when slots are full and a new key returns false; `takeItem` beyond qty throws `insufficient_items` and leaves qty unchanged.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Existing `tests/game/wallet.test.ts` must keep passing unchanged.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(game): withPlayer transaction core, ledger and storage capacity`

## Phase B — Rules engine

### Task 4: Fish formulas and creation

**Files:**
- Create: `lib/game/fish/formulas.ts`, `lib/game/fish/create.ts`, `tests/game/formulas.test.ts`, `tests/game/create-fish.test.ts`

**Interfaces:**
- Produces (pure):
  - `computeBaseValue(i: { rarity: Rarity; weightGrams: number; ageDays: number; valuePerKg: number }, cfg: ValueConfig): number` = `round(cfg.rarityMult[rarity] × (valuePerKg × weightGrams/1000 + cfg.perAgeDay × ageDays))`, minimum 1.
  - `isMature(weightGrams: number, maxWeightGrams: number): boolean` = `weightGrams >= maxWeightGrams`.
  - `reviveCoinCost(rarity, ageDays, cfg.revive): number` = `costBase[rarity] + costPerAgeDay × ageDays`.
  - `revivedHp(hpMax: number, hpRatio: number): number` = `max(1, floor(hpMax × hpRatio))`.
  - `saleAmount(f: { baseValue: number; weightGrams: number; maturitySaleBonusCoins: number | null; maturitySaleBonusPct: number | null }, maxWeightGrams: number, mode: 'sell' | 'release'): { coins: number; maturityBonus: number }`. Release = `floor(baseValue × RELEASE_RATIO)` with no bonus. Sell = `baseValue` plus a bonus, only if `isMature` now **and** the snapshot is non-null: `bonusCoins + floor(baseValue × bonusPct / 100)`.
  - `applicableMilestones(all: MilestoneRow[], speciesKey: string): MilestoneRow[]`: the species' own live milestones if any exist, else the live defaults.
  - `newlyReached(peakGrams: number, applicable: MilestoneRow[], alreadyReachedWeights: Set<number>): MilestoneRow[]`.
- Produces (DB): `createFish(tx, userId, speciesKey, origin, opts: { location: FishLocation; tripId?: string; rng: Rng; cfg: GameConfig; weightGrams?: number; now: Date }): Promise<Fish>`. Rolls sex 50/50, weight uniform in spawn range (unless given), age in spawn age range, `hp = care.hpMax`. Stores `baseValue` and `rarity` from the species. Upserts `SpeciesDiscovery` (`via = origin`), writes `FishEvent acquired`, calls `bumpStat('species_discovered')` on a first discovery (stub until Task 12). Throws `species_inactive` if the species is inactive or deleted.

- [ ] **Step 1: Failing unit tests**, one per rule: value is fixed by its inputs; `isMature` at exactly max → true; release of a mature fish → 25% with no bonus; sell of a mature fish with snapshot `{50, 10}` and base 200 → `{coins: 270, maturityBonus: 70}`; sell of a fish that matured earlier but is now below max → 200 with no bonus; species with own milestones ignores defaults; `newlyReached(5000, [1kg,2kg,5kg,10kg], {2000})` → 1kg and 5kg; `revivedHp(100, 0.3) === 30`.
- [ ] **Step 2: Failing integration test** `createFish`: stores rarity and baseValue matching `computeBaseValue`, creates a discovery once for two fish of the same species, throws `species_inactive` for an inactive `t_` species.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement (then finish `grantStarter` from Task 3). **Step 5:** Run → PASS.
- [ ] **Step 6: Commit** `feat(game): fish value, maturity, sale and milestone formulas; createFish`

### Task 5: Offline simulation engine (pure)

**Files:**
- Create: `lib/game/sim/simulate.ts`, `tests/game/simulate.test.ts`

**Interfaces:**
- Produces:
  - `type SimFish = { id: string; hp: number; weightGrams: number; satietyTicks: number; growthMult: number; ageDays: number; daysInTank: number; revivedAt: Date | null; species: { maxWeightGrams: number; growthGramsPerTick: number; foodUnitsPerFeed: number } }`
  - `type FoodStats = { satietyMult: number; hpMult: number; growthMult: number }`
  - `type SimInput = { from: Date; ticks: number; dirt: number; fish: SimFish[]; autoFeed: { itemKey: string; stats: FoodStats; main: number; reserve: number } | null; autoClean: { items: number } | null; time: { timezone: string; resetHour: number } }`
  - `type SimEvent = { type: 'fed' | 'starved' | 'died' | 'auto_feed_empty' | 'auto_clean' | 'auto_clean_skipped' | 'aged'; fishId?: string; at: Date; data?: Record<string, number> }`
  - `type SimOutput = { dirt: number; fish: SimFish[]; died: { id: string; at: Date }[]; peaks: Record<string, { grams: number; at: Date }>; used: { main: number; reserve: number; cleanItems: number }; events: SimEvent[]; lastAutoCleanAt: Date | null }`
  - `simulate(input: SimInput, care: CareConfig, rng: Rng): SimOutput`
  - `feedFish(fish: SimFish[], stats: FoodStats, units: { main: number; reserve: number }, care: CareConfig, rng: Rng): { fedIds: string[]; used: { main: number; reserve: number } }`: shared with manual feeding (Task 7).

Per-tick algorithm (tick `k` spans `[from + k·tick, from + (k+1)·tick)`; `at` = tick end). The tests don't fully pin the order, so it is fixed here:
1. `alive` = fish with `hp > 0`, in input order. If empty, skip steps 2–7 but still do step 8 (day boundary).
2. **Auto-feed** (if `autoFeed`): `hungry = alive.filter(satietyTicks === 0)`; `feedFish(hungry, …)` takes main first, then reserve, in `shuffle(hungry, rng)` order, and **stops at the first fish whose `foodUnitsPerFeed` exceeds what is left** (§4.3). If it stops with hungry fish remaining, emit `auto_feed_empty`.
3. Feeding sets `satietyTicks = round(care.feedSatietyTicks × satietyMult)`, `hp += round(care.hpPerFeed × hpMult)`, and `growthMult = stats.growthMult`.
4. `threshold` = the entry of `dirtThresholds` with the highest `at` ≤ `dirt` (none if dirt is below the first) (§4.4).
5. Each alive fish: if `satietyTicks > 0`: decrement it, and if there is no threshold, `weight += round(growthGramsPerTick × growthMult)`. Else (hungry): `hp -= hungerHpLossPerTick`, `weight -= round(growthGramsPerTick × hungerWeightLossRatio)`. Then if `threshold`: `hp -= threshold.hpLossPerTick`, `weight -= round(growthGramsPerTick × threshold.weightLossRatio)`.
6. Clamp `weight` to `[1, maxWeightGrams]` and `hp` to `[0, hpMax]`. Update `peaks` when weight exceeds the previous peak. `hp === 0` → push to `died` with `at`. The fish is excluded from all later ticks (§11).
7. `dirt = min(dirtMax, dirt + dirtBasePerTick + dirtPerFishPerTick × aliveAtTickStart)`. Dirt only grows while there are alive fish (§4.4: dead/stored fish don't dirty the tank).
8. If `dayKey(at) !== dayKey(at − tick)`: every still-alive fish gets `ageDays++` and `daysInTank++`; `dailyDue = true`.
9. **Auto-clean** (if `autoClean`): `due = dailyDue || dirt >= autoCleanEarlyAt`. **At most one run per tick**, so a scheduled run and an early trigger in the same tick collapse into one (§4.4). If `items >= autoCleanItemQty`: consume, `dirt = max(0, dirt − autoCleanEffect)`, emit `auto_clean`. Else emit `auto_clean_skipped` and leave dirt.

- [ ] **Step 1: Failing tests** (all with `seededRng(7)` and an inline `CareConfig` fixture whose numbers live in the test file):
  - `well-fed fish below first dirt threshold gains growthGramsPerTick per tick and caps at max`.
  - `hungry fish loses hp per tick and dies at 0; died.at equals the tick end, not input end`.
  - `dead fish is not fed afterwards: food used stops after death` (Review Focus #3): 2 fish, food for 3 feeds, one fish has 1 hp → food is consumed only by the survivor after the death tick.
  - `auto-feed takes main before reserve, then stops when a fish needs more than remains`.
  - `not enough food: random subset fed, deterministic per seed`.
  - `dirt thresholds escalate: above 2nd threshold applies 2nd penalties only`.
  - `dirt does not rise with zero alive fish`.
  - `scheduled and early auto-clean in same tick run once` (one `auto_clean` event, one item used).
  - `auto-clean with no items is skipped and dirt keeps rising`.
  - `age increments only on day-boundary ticks, and only for alive fish`.
  - `10 000 ticks with 20 fish completes under 200 ms` (unbounded offline, §11).
  - `simulate(x, n) then simulate(rest, m) equals simulate(x, n+m)` (chunking invariance with the same RNG stream). This proves resume-after-partial is safe.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(sim): deterministic offline tank simulation`

### Task 6: advanceWorld — persist simulation, revive expiry, stale trips

**Files:**
- Create: `lib/game/sim/advance.ts`, `tests/game/advance.test.ts`
- Modify: `lib/game/tx.ts` (call real `advanceWorld`)

**Interfaces:**
- Consumes: `simulate`, `loadConfig`, `takeItem`, `openGrowthRewards` (Task 8; stub that records peaks until then).
- Produces: `advanceWorld(tx: Tx, userId: string, now: Date, cfg: GameConfig, rng: Rng): Promise<{ ticks: number; died: string[]; lost: string[] }>`
  1. `ticks = floor((now − tank.simulatedUntil) / tickMinutes)`. If `ticks > 0`: load alive `location = tank` fish with species, the autoFeed stacks (if `tank.autoFeed && careLevel.autoFeed && autoFeedItemKey`), and the cleaning stack (if `autoClean && careLevel.autoClean`). Run `simulate`. Write back fish rows, `tank.dirt`, `tank.simulatedUntil += ticks × tick` (not `now`, so the remainder carries over), `lastAutoCleanAt`. Subtract stacks. Write `FishEvent`s with `occurredAt = event.at`. For each death: `status = dead`, `location = none`, `diedAt = at`. If `revivedAt` is null, set `reviveDeadline = at + REVIVE_WINDOW_DAYS`; otherwise (second death, §5.2) set `status = lost`, `endedAt = at`. Then pass `peaks` to `openGrowthRewards`.
  2. **Revive expiry:** `UPDATE fish SET status='lost', "endedAt"="reviveDeadline" WHERE userId=$1 AND status='dead' AND "reviveDeadline" <= now` + a `lost` event with `occurredAt = reviveDeadline`.
  3. **Stale trips:** active trips with `lastSeenAt < now − tripTimeoutSec` → `cancelTrip(tx, tripId, 'timeout')` (Task 11; stub until then).

- [ ] **Step 1: Failing integration tests** (move time by passing `opts.now` to `withPlayer`):
  - `advancing twice to the same now processes ticks once` (`simulatedUntil` and the food stack are unchanged by the second call).
  - `concurrent advance from two "logins" consumes food once` (Review Focus #1): `Promise.all` of 2 `withPlayer(no-op, { now })` → stack decreased exactly by one simulation's usage.
  - `storage fish untouched across 30 days` (§13): hp/weight/age/satiety identical before and after.
  - `first death sets reviveDeadline = diedAt + 14 days where diedAt is the simulated tick time`.
  - `deadline passing while offline marks lost with endedAt = reviveDeadline` (Review Focus #5): advance to `deadline + 3 days` in one call → `lost`, `endedAt` equals the deadline.
  - `second death after revive goes straight to lost` (§13).
  - `remainder under one tick carries over` (`simulatedUntil` advances by whole ticks only).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(sim): advanceWorld persists offline ticks, revive expiry and deaths`

### Task 7: Tank care actions + routes

**Files:**
- Create: `lib/game/care.ts`, `app/api/tank/feed/route.ts`, `app/api/tank/clean/route.ts`, `app/api/tank/settings/route.ts`, `app/api/tank/reserve/route.ts`, `app/api/fish/[id]/move/route.ts`, `app/api/fish/[id]/route.ts` (GET detail, PATCH nickname), `tests/game/care.test.ts`
- Modify: `app/api/care/water-change/route.ts` (delete; the client switches to `/api/tank/clean`)

**Interfaces:**
- Produces:
  - `feedTank(tx, userId, itemKey: string, ctx): Promise<{ fedIds: string[]; skippedIds: string[] }>`: alive tank fish only, `feedFish` with the main stack only (§4.2). Throws `insufficient_items` if 0 fish can be fed. Calls `bumpStat('fish_fed', fedIds.length)`.
  - `cleanTank(tx, userId, levelKey: string, ctx): Promise<{ dirt: number }>`: level from `care.cleaningLevels`, paid in coins (`adjustCoins`, reason `clean:<key>`) or items. `bumpStat('tank_cleaned')`.
  - `setAutoCare(tx, userId, s: { autoFeed?: boolean; autoClean?: boolean; autoFeedItemKey?: string }): Promise<void>`: throws `forbidden` if enabling without the care upgrade.
  - `moveReserve(tx, userId, itemKey: string, qty: number, dir: 'in' | 'out'): Promise<void>`: food category only. `out` needs an item slot if the main stack is empty (`item_storage_full`).
  - `moveFish(tx, userId, fishId: string, to: 'tank' | 'storage'): Promise<void>`: alive fish only, same id kept, event `moved`. To tank: `tankCapacity` check → `tank_full`. To storage: `assertFishStorage`. A fish with `location = trip` → `not_found`.
  - `renameFish(tx, userId, fishId, nickname: string | null): Promise<void>`: trimmed, 1–24 chars or null (falls back to the species name, §3.1). Event `renamed`.
  - `fishDetail(tx, userId, fishId): Promise<FishDetailDTO>`: fish, species name, `isMature`, events (latest 100), milestone states (`reached/claimable/claimed`), sale record.
- Route body shapes: feed `{ itemKey }`, clean `{ levelKey }`, settings `{ autoFeed?, autoClean?, autoFeedItemKey? }`, reserve `{ itemKey, qty, direction }`, move `{ to }`, PATCH `{ nickname }`. Every route is wrapped in `gameRoute` + `withPlayer` with the idempotency key.

- [ ] **Step 1: Failing tests:** `feeding with food for 2 of 3 fish feeds 2 random fish and leaves the 3rd hungry`; `tank full blocks move and creates no fish row` (§13: count of `fish` rows unchanged); `move keeps the fish id`; `clean by coins with insufficient coins → insufficient_coins, dirt unchanged`; `enabling autoFeed without care upgrade → forbidden`; `rename to empty string → invalid_input`, `rename to null → species name in detail`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(care): manual feed/clean, auto-care settings, reserve, move and rename`

### Task 8: Rewards — claims, milestones, maturity

**Files:**
- Create: `lib/game/rewards.ts`, `app/api/rewards/route.ts` (GET inbox), `app/api/rewards/claim/route.ts`, `tests/game/rewards.test.ts`

**Interfaces:**
- Produces:
  - `openClaim(tx, userId, source: ClaimSource, sourceRef: string, bundle: RewardBundle, fishId?: string): Promise<{ claimId: string; created: boolean }>`: insert, `ON CONFLICT (userId, source, sourceRef) DO NOTHING`. Parts: one `coins`, one `exp`, one per item.
  - `claimParts(tx, userId, partIds: string[]): Promise<{ claimed: string[]; blocked: string[] }>`: coins → `adjustCoins` reason `claim:<source>`; exp → `grantExp(..., 'claim')` uncapped; items → `tryGrantItem` (false → `blocked`, still pending, §6.1). A part already claimed is skipped silently (retry-safe). Sets `completedAt` when no `pending` parts remain.
  - `openGrowthRewards(tx, userId, peaks: Record<string, { grams: number; at: Date }>, now: Date): Promise<void>`: for each fish, `newlyReached` → insert `FishMilestone` (PK guards duplicates) + `openClaim('milestone', \`${fishId}:${weightGrams}\`)` + event `milestone`. If `peak >= species.maxWeightGrams`: when `maturedAt` is null, set `maturedAt = at` and snapshot `maturitySaleBonus*` from the species, then `openClaim('maturity', fishId, species.maturityReward)` and `bumpStat('fish_matured')`.
  - `rewardInbox(tx, userId): Promise<ClaimDTO[]>`: claims with ≥ 1 pending part.

- [ ] **Step 1: Failing tests:**
  - `milestones are independent: jumping from 0.5 kg to 6 kg opens 1, 2 and 5 kg claims`.
  - `the same milestone is never opened twice for a fish` (call `openGrowthRewards` twice).
  - `storage full: coins part claims, item part stays pending, claim not complete` (§13).
  - `claim retry with same idempotency key credits once` (Review Focus #2): two `withPlayer` calls with one key → coins +X once.
  - `claiming already-claimed part ids credits nothing`.
  - `maturity reward opens once even if the fish matures, shrinks and matures again; the bonus snapshot stays the first one`.
  - `unclaimed maturity reward persists after fish drops below max` (§6.3).
- [ ] **Step 2–4:** FAIL → implement → PASS (replace the Task 6 stub).
- [ ] **Step 5: Commit** `feat(rewards): claim inbox with partial claims, milestones and maturity`

### Task 9: Shop, blindbox, upgrades

**Files:**
- Create: `lib/game/shop.ts`, `lib/game/upgrades.ts`, `app/api/shop/route.ts` (GET catalog), `app/api/shop/buy/route.ts`, `app/api/items/blindbox/open/route.ts`, `app/api/upgrades/route.ts` (GET), `app/api/upgrades/buy/route.ts`, `tests/game/shop.test.ts`

**Interfaces:**
- Produces:
  - `shopCatalog(tx, userId): Promise<ShopDTO>`: active species with `buyPrice` (+ max possible weight), shop-visible items, blindboxes with odds (from `blindbox_entries`, active species only), and upgrades with next level, cost and `minPlayerLevel`.
  - `buy(tx, userId, offer: { type: 'fish' | 'blindbox' | 'item'; key: string; qty?: number }, ctx): Promise<{ fishIds?: string[]; coins: number }>`:
    - fish: `assertFishStorage(spawnWeightMaxGrams)` **before** charging, then `adjustCoins(-buyPrice)`, then `createFish(origin 'shop', location storage)`.
    - blindbox bought in the shop is opened immediately: capacity check against the **heaviest possible** entry (`max spawnWeightMaxGrams` over the box's active entries), charge, roll `pickWeighted`, `createFish(origin 'blindbox')`. Because capacity is checked before the roll, a failed purchase can't be retried for a new roll.
    - item/gear: `adjustCoins` + `grantItemOrThrow`. Throws `species_inactive` for an inactive species.
    - Because everything runs in one transaction, a `storage_full` or `item_storage_full` thrown after the charge still rolls the charge back (§8.2).
  - `openBlindbox(tx, userId, boxKey, ctx): Promise<{ fishId: string }>`: for boxes in inventory (from rewards). Same capacity rule, then `takeItem(box, 1)`.
  - `buyUpgrade(tx, userId, track: string): Promise<{ level: number }>`: next level must exist; `level_too_low` if player level < `minPlayerLevel`; coins via ledger.

- [ ] **Step 1: Failing tests:** `storage full when buying fish → storage_full, coins unchanged, no fish row` (§13); `insufficient coins → no fish, balance unchanged` (§13); `blindbox can yield duplicate species as separate ids` (seeded rng, 2 opens, same species, distinct ids); `inactive species not in catalog and not rollable`; `buy retry with same key charges once` (Review Focus #2); `upgrade requires level`; `revive item (price null) is not purchasable → not_found`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(shop): direct fish, blindbox, items, gear and upgrades with capacity checks`

### Task 10: Sell, release, revive

**Files:**
- Create: `lib/game/sell.ts`, `lib/game/revive.ts`, `app/api/fish/sell/route.ts` (POST), `app/api/fish/sell/preview/route.ts` (POST, no idempotency needed, read-only), `app/api/fish/[id]/revive/route.ts`, `tests/game/sell.test.ts`, `tests/game/revive.test.ts`

**Interfaces:**
- Produces:
  - `previewSale(tx, userId, fishIds: string[], mode: 'sell' | 'release'): Promise<{ lines: { fishId: string; coins: number; maturityBonus: number }[]; total: number }>`: alive fish in `storage` or `tank` only, else `invalid_input`.
  - `settleSale(tx, userId, fish: Fish[], mode, now): Promise<{ total: number; batchId: string }>`: the shared write path below, with no location check (Task 11 reuses it for cooler releases).
  - `sellFish(tx, userId, fishIds: string[], mode): Promise<{ total: number; batchId: string }>`: validates location, then `settleSale`; same lines; inserts a `FishSale` per fish (PK → a fish sold twice fails the batch), sets `status = sold | released`, `location = none`, `endedAt = now`, events; **one** `adjustCoins(+total, 'sell_batch:<batchId>')`. `bumpStat('fish_sold', n)`.
  - `reviveFish(tx, userId, fishId, method: 'coins' | 'item', ctx): Promise<{ hp: number }>`: requires `status = dead`, `reviveDeadline > now`, `revivedAt` null (else `revive_unavailable`). `assertFishStorage(weightGrams)` (§5.2: the deadline keeps counting). Pays `reviveCoinCost` or takes `cfg.revive.itemKey` ×1. Sets `status alive`, `location storage`, `hp = revivedHp`, `satietyTicks 0`, `revivedAt = now`.

- [ ] **Step 1: Failing tests:** `mixed batch: mature fish gets bonus on sell, none on release`; `batch containing an already-sold fish fails whole batch, no coins`; `selling 20 fish creates one ledger row with the sum` (§9.2); `two concurrent batches overlapping one fish: exactly one succeeds` (§13); `release pays floor(25%)`; `revive after deadline fails even if advance has not run yet` (Review Focus #5: with `skipAdvance` the rule still checks `reviveDeadline > now`); `revive with storage full → storage_full, fish stays dead, deadline unchanged`; `second revive attempt → revive_unavailable`; `revived fish lands in storage with partial hp`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(economy): batch sell/release with maturity bonus, and one-time revive`

### Task 11: Fishing — zones, loadout, trips, cast, repair

**Files:**
- Create: `lib/game/fishing/zones.ts`, `lib/game/fishing/loadout.ts`, `lib/game/fishing/trip.ts`, `lib/game/fishing/cast.ts`, `lib/game/fishing/repair.ts`; routes `app/api/fishing/zones/route.ts`, `app/api/fishing/zones/[key]/unlock/route.ts`, `app/api/fishing/loadout/route.ts` (PUT), `app/api/fishing/trips/route.ts` (POST start), `app/api/fishing/trips/[id]/route.ts` (GET: cooler fish, load, capacity, bait count), `app/api/fishing/trips/[id]/{cast,heartbeat,release,return,cancel}/route.ts`, `app/api/gear/[id]/repair/route.ts`; `tests/game/fishing.test.ts`

**Interfaces:**
- Produces:
  - `unlockZone(tx, userId, zoneKey): Promise<void>`: `level_too_low`, then coins. Idempotent once unlocked (no second charge, §7.1). `bumpStat('zones_unlocked')`.
  - `setLoadout(tx, userId, l: { rodId?: string | null; lineId?: string | null; hookId?: string | null; coolerId?: string | null; baitKey?: string | null }): Promise<void>`: each id must be owned gear of the matching category.
  - `startTrip(tx, userId, zoneKey, now): Promise<{ tripId: string }>`: zone unlocked, no other active trip (cancels any existing active trip with `closed` first: a new session means the previous game was closed, §7.4).
  - `heartbeat(tx, userId, tripId, now)`: `lastSeenAt = now` for an active trip, else `trip_not_active`.
  - `cast(tx, userId, tripId, ctx): Promise<{ outcome: 'miss' } | { outcome: 'caught'; fishId: string; weightGrams: number; fought: boolean } | { outcome: 'escaped'; weightGrams: number }>`:
    1. Preconditions in order: trip active → rod/line/hook/cooler equipped with `durability > 0` (`gear_broken`) → bait stack ≥ 1 (`no_bait`) → cooler load ≤ `cooler.stats.capacityGrams` (`cooler_full`).
    2. `takeItem(bait, BAIT_PER_CAST)`; `bumpStat('casts')`.
    3. `pickWeighted([...zoneSpecies (active) × bait.stats.speciesMult[key] ?? 1, { miss: zone.missWeight }])`. Miss → return, **no durability change** (§7.3).
    4. Weight uniform in `[spawnWeightMinGrams, spawnWeightMaxGrams]`; `limit = min(rod, line, hook stats.maxLoadGrams)`.
    5. If `weight > limit`: `p = clamp(fightBaseSuccess × limit / weight, 0, 1)`; `rng() >= p` → each of rod/line/hook loses `fightFailDurabilityLoss` → `escaped`.
    6. Caught: each loses `catchDurabilityLoss` (+ `incompatibleExtraLoss` if `max(tier) − min(tier) > compatibleTierSpread`), floored at 0. `createFish(origin 'fishing', location 'trip', tripId)`; `bumpStat('fish_caught')`; `grantExp('catch')`.
  - `releaseFromCooler(tx, userId, tripId, fishIds)`: fish must belong to this active trip; `settleSale(…, 'release')` (25% each).
  - `returnHome(tx, userId, tripId, keepIds: string[]): Promise<{ kept: string[]; released: { fishId: string; coins: number }[] }>`: `UPDATE fishing_trips SET status='completed', "endedAt"=now, "endReason"='returned' WHERE id=$1 AND status='active'`. 0 rows → `trip_not_active`. Then `assertFishStorage(sum keep)`; failure throws `storage_full` and rolls back the status flip. Kept → `location storage`. The rest are released at 25% (§7.4, no selling here).
  - `cancelTrip(tx, tripId, reason: 'closed' | 'timeout'): Promise<boolean>`: same conditional update to `cancelled`; trip fish → `status abandoned`, `location none`, `endedAt`. Returns false if not active.
  - `repairGear(tx, userId, gearId): Promise<{ durability: number }>`: cost `(max − durability) × repairCostPerPoint`, sets it to max (§7.2).
- The client calls `navigator.sendBeacon('/api/fishing/trips/<id>/cancel')` on `pagehide`. `GET /api/state` (Task 13) cancels active trips on load.

- [ ] **Step 1: Failing tests:** `miss consumes one bait and no durability` (§13); `catch reduces durability; fish sits in trip, not storage`; `fight failure: fish escapes, durability drops`; `durability 0 → gear_broken, no bait consumed`; `repair restores and charges`; `trip fish cannot be moved or sold (not_found / invalid_input)`; `return with too little storage → storage_full, trip still active`; `return keeps selected, releases rest at 25%`; `return vs cancel race: exactly one succeeds, fish end either in storage or abandoned, never both` (Review Focus #4); `stale trip cancelled by advanceWorld after tripTimeoutSec`; `zone unlock needs level and coins; second unlock does not charge`.
- [ ] **Step 2–4:** FAIL → implement → PASS (replace the Task 6 stub).
- [ ] **Step 5: Commit** `feat(fishing): zones, loadout, trips, server-side casts, durability and repair`

### Task 12: Progression — EXP, stats, quests, login, achievements, collection

**Files:**
- Create: `lib/game/progression.ts`, `app/api/quests/route.ts`, `app/api/achievements/route.ts`, `app/api/collection/route.ts`, `tests/game/progression.test.ts`

**Interfaces:**
- Produces:
  - `METRICS = ['fish_caught','casts','species_discovered','fish_matured','zones_unlocked','fish_fed','tank_cleaned','fish_sold'] as const`
  - `grantExp(tx, userId, source: string, amount?: number, now?: Date): Promise<{ granted: number; level: number }>`: amount defaults to `cfg.exp.sources[source].exp`. Capped by `dailyCap` from that day's `exp_grants` sum. Level = 1 + count of `levelThresholds` ≤ exp.
  - `bumpStat(tx, userId, metric, by = 1, now): Promise<void>`: upserts `player_stats`, advances today's `player_quests` with that metric (completion → `completedAt` + `openClaim('quest', questId, template.reward)`), and checks `achievement_defs` thresholds (→ `player_achievements` insert-if-absent + `openClaim('achievement', key)`).
  - `ensureDailyQuests(tx, userId, now, rng): Promise<PlayerQuest[]>`: if none for today's dayKey, pick `cfg.quests.perDay` active templates where `minLevel ≤ level` and `requires` holds (`tankFish` → ≥ 1 alive tank fish; `zoneKey` → unlocked). Never assigns an impossible quest (§10.3). Old days' rows stay as history.
  - `recordDailyLogin(tx, userId, now): Promise<{ streak: number; claimId: string | null }>`: insert `DailyLogin(dayKey)` if absent. Streak = previous `lastLoginDay` is yesterday ? streak + 1 : 1. Reward `login.rewards[(streak − 1) % len]` → `openClaim('login', dayKey)`.
  - `collection(tx, userId): Promise<{ discovered: …[]; history: FishHistoryDTO[] }>`: history = every fish ever owned, including sold, released, lost and abandoned (§9.3).

- [ ] **Step 1: Failing tests:** `daily exp cap stops at cap and resumes next dayKey`; `level up crosses multiple thresholds`; `missing a day resets streak to 1` (§10.3); `login twice same day: one claim`; `quests require tank fish are not assigned with an empty tank`; `completing a quest opens exactly one claim`; `achievement completes once`; `collection history keeps sold and lost fish`.
- [ ] **Step 2–4:** FAIL → implement → PASS (replace earlier stubs).
- [ ] **Step 5: Commit** `feat(progression): exp with caps, stats, daily quests, login streak, achievements, collection`

### Task 13: Admin backend + bootstrap snapshot

**Files:**
- Create: `lib/game/admin/species.ts`, `lib/game/admin/milestones.ts`, `lib/game/snapshot.ts`, `app/api/state/route.ts`, `app/api/storage/route.ts`, `app/api/admin/species/route.ts` (GET list, POST create), `app/api/admin/species/[key]/route.ts` (PATCH), `app/api/admin/milestones/route.ts` (GET, POST), `app/api/admin/milestones/[id]/route.ts` (PATCH, DELETE = soft), `app/api/admin/history/route.ts`, `scripts/make-admin.mjs`, `tests/game/admin.test.ts`
- Modify: `lib/api.ts` (`requireAdmin()` → 403 `forbidden`), `lib/auth/session.ts` (`PublicUser` gains `role`)

**Interfaces:**
- Produces:
  - `updateSpecies(adminId, key, patch: Partial<Omit<Species, 'key' | 'version'>>): Promise<Species>`: own `prisma.$transaction`. Snapshot before, apply, `version++`. If `maxWeightGrams` changed → `reconcileMaturity(tx, key, now)`: alive fish of the species with `weightGrams >= newMax` and `maturedAt` null get matured + claim (the fish's weight is not reduced). Fish now below the new max are simply not mature, since maturity is computed. Writes `SpeciesChangeLog` (kind `rename` when only `displayName` changed, else `update`/`activate`/`deactivate`/`soft_delete`) with `affectedFishIds`. Any throw → nothing written (§6.4).
  - `createMilestone(adminId, m: { speciesKey: string | null; weightGrams: number; reward: RewardBundle }, pendingPolicy: 'keep' | 'replace')`, `updateMilestone(adminId, id, patch, pendingPolicy)`, `deleteMilestone(adminId, id)`: each in one transaction:
    - create/update weight → `reconcileMilestones(tx, speciesKey | all-default-users, weightGrams)`: alive fish with weight ≥ milestone and no `FishMilestone(fishId, weightGrams)` get a claim. Existing `FishMilestone` at that weight: completed → nothing (§6.2, no second payout). Pending → `replace`: pending parts → `void`, new parts from the new bundle, claimed parts kept; `keep`: unchanged.
    - delete → `deletedAt = now`; claims untouched. A deleted id can't be re-activated (PATCH on a deleted id → `not_found`).
    - `MilestoneChangeLog` with before/after/policy/affectedClaimIds.
  - `buildSnapshot(tx, userId, ctx): Promise<GameSnapshot>`. `GameSnapshot = { player: { coins, level, exp, nextLevelExp, role }; tank: { dirt, dirtThresholds, capacity, autoFeed, autoClean, autoFeedItemKey, care: { autoFeed, autoClean } }; tankFish: TankFishDTO[]; dead: { id, name, reviveDeadline, reviveCost }[]; counts: { pendingClaims, questsClaimable }; activeTripId: string | null }`. `TankFishDTO = { id, name, speciesKey, modelKey, rarity, sex, hp, hpMax, weightGrams, maxWeightGrams, mature, hungry }`.
  - `GET /api/state` = `withPlayer` (no idempotency; reads + advance) → `cancelTrip` for any active trip (`closed`) → `recordDailyLogin` → `ensureDailyQuests` → `buildSnapshot`. Because this route mutates, it must carry `Cache-Control: no-store`.
  - `GET /api/storage` → `{ fish: StorageFishDTO[]; fishCapacity; stacks; reserve; gear; slots; loadout }`.

- [ ] **Step 1: Failing tests:** `lowering max weight matures heavy fish without changing weight` (§13); `raising max weight makes fish immature; unclaimed maturity claim survives`; `matured-claimed fish never gets a second maturity claim after down/up changes`; `failed species update (invalid field after valid one) leaves species and log unchanged`; `rename logs old/new name`; `deleted milestone stops new claims; pending kept`; `recreated same-weight milestone: claimed fish get nothing; pending replaced under replace, kept under keep` (§6.2); `non-admin → forbidden`; `GET /api/state twice → one DailyLogin, ticks processed once`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(admin): species and milestone admin with atomic change logs; game snapshot API`

## Phase C — UI

UI tasks are verified by `npm run typecheck`, a browser check through `preview_start {name: "fishora-dev"}` at 1280px and 375px (both locales), and the E2E specs in Task 21. Every screen shows loading, empty and error states, and maps `error` codes to `t('error.<code>')`.

### Task 14: Client data layer, UI kit additions, HUD chrome

**Files:**
- Create: `lib/client/api.ts`, `lib/client/GameProvider.tsx`, `components/ui/Modal.tsx`, `components/ui/Drawer.tsx`, `components/ui/Tabs.tsx`, `components/ui/Field.tsx`, `components/ui/Stepper.tsx`, `components/ui/Countdown.tsx`, `components/ui/Confirm.tsx`, `components/hud/TopBar.tsx`, `components/hud/Dock.tsx`
- Modify: `components/ui/index.tsx` (re-export), `components/ui/ui.module.css`, `components/FishoraStage.tsx` (wrap in `GameProvider`, render the active screen), `components/hud/Hud.tsx` (status panel replaced in Task 15; remove the shop placeholder modal), `lib/game/useGameState.ts` (guest-only: keep the clock, light, weather and the local demo; drop the server branch), `lib/i18n.tsx` (`nav.*`, `error.*`, `common.*` keys en + vi)

**Interfaces:**
- Produces:
  - `api<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown, opts?: { key?: string }): Promise<{ ok: true; data: T } | { ok: false; error: string; detail?: unknown }>`: non-GET calls send `Idempotency-Key` (`opts.key ?? crypto.randomUUID()`). One automatic retry on network failure **with the same key**.
  - `useGame(): { snapshot: GameSnapshot | null; loading: boolean; refresh(): Promise<void>; act<T>(method, path, body?): Promise<Result<T>>; screen: Screen; open(screen: Screen, arg?: string): void; close(): void }`. `act` refreshes the snapshot after success. `type Screen = null | 'tank' | 'fish' | 'storage' | 'shop' | 'fishing' | 'trip' | 'rewards' | 'collection'`.
  - The snapshot refreshes every `care.tickMinutes` (from the snapshot) and on `visibilitychange` → visible.
  - `TopBar`: coins (existing button style), level badge + EXP `ProgressBar`, bell `Badge` with `counts.pendingClaims + counts.questsClaimable` → opens Rewards. A "dead fish" warning chip with the nearest `Countdown` → opens the Fish drawer.
  - `Dock` (bottom, replaces the Feed/Water/Clean bar for signed-in players): Tank, Storage, Shop, Fishing, Rewards, Collection. Signed out → one "Sign in to play" button opening Settings.
  - `Modal` (centered, `role="dialog"`, Esc/backdrop close, focus trap), `Drawer` (right side; bottom sheet below 640px), `Tabs` (`role="tablist"`, arrow keys), `Countdown({ to: Date })` (`dd hh:mm`, live), `Confirm({ title, body, confirmLabel, onConfirm })`.

- [ ] **Step 1:** Implement the data layer. Write `tests/client/api.test.ts` for `api()`: the retry reuses the same `Idempotency-Key` (mock `fetch`); a 409 JSON body maps to `{ ok: false, error }`.
- [ ] **Step 2:** `npm test -- tests/client` → PASS. `npm run typecheck` → clean.
- [ ] **Step 3:** Build the kit pieces and HUD chrome. Verify in the browser: signed in, TopBar shows server coins/level and the Dock opens empty screens. Signed out, the demo tank still runs and the Dock shows the sign-in CTA. Check at 375px with no horizontal scroll.
- [ ] **Step 4: Commit** `feat(ui): game data provider, kit additions, top bar and dock`

### Task 15: Tank screen, fish drawer, server-driven aquarium

**Files:**
- Create: `components/screens/tank/TankPanel.tsx`, `components/screens/tank/FishDrawer.tsx`, `components/screens/tank/FeedDialog.tsx`, `components/screens/tank/CleanDialog.tsx`, `components/screens/tank/AutoCarePanel.tsx`
- Modify: `components/scene/AquariumScene.tsx` (+ `components/scene/Fish.tsx` if needed): accept `fish: { id: string; modelKey: string; scale: number }[]` instead of the static `TANK_FISH`. `scale = 0.6 + 0.4 × weightGrams / maxWeightGrams`. Unknown `modelKey` → `betta` model. Guest mode passes the current `TANK_FISH` list.

**UI content (from §3, §4, §5, §6):**
- TankPanel (replaces the status panel at top-left, still collapsible): name "Your tank", capacity `x / max`, dirt meter with threshold ticks and a Badge (clean / dirty level n), fish list rows (name, species, rarity badge, HP bar, weight `kg` with 2 decimals, "Mature" badge, "Hungry" badge). Actions: Feed (FeedDialog: pick food tier from stacks, shows units needed `Σ foodUnitsPerFeed` vs owned) and Clean (CleanDialog: levels with coin/item cost and effect). AutoCarePanel: toggles (disabled with an "Upgrade Care" hint when not unlocked), auto-feed food picker, reserve hopper amount with in/out Stepper.
- FishDrawer (`open('fish', id)` from rows, and from clicking a fish in 3D via a raycast `onClick` on the fish mesh): editable nickname (empty → species name), sex, rarity, age days, days in tank, HP, weight / max, base value, maturity bonus snapshot. Milestones list with state chips (reached / claimable → "Claim" opens Rewards filtered to this fish / claimed). History timeline from events (occurredAt shown, sorted). Actions: Move to storage, Sell, Release (each with a `Confirm` showing coins from `/api/fish/sell/preview`). For a dead fish: Revive by coins / item with cost and a `Countdown` to the deadline, disabled with the reason when storage is full.

- [ ] **Step 1:** Implement. Clicking a fish in the scene must not trigger camera orbit drag (use `onPointerDown` stopPropagation only on click without movement).
- [ ] **Step 2:** `npm run typecheck` → clean.
- [ ] **Step 3: Browser verify** with seed data: feed with too little food → toast names the number of fish fed; tank-full move shows `error.tank_full`; rename persists after reload; revive countdown renders. Take a screenshot at 375px.
- [ ] **Step 4: Commit** `feat(ui): tank panel, fish drawer and server-driven aquarium fish`

### Task 16: Storage screen with bulk sell

**Files:**
- Create: `components/screens/storage/StorageScreen.tsx`, `components/screens/storage/FishTab.tsx`, `components/screens/storage/ItemsTab.tsx`, `components/screens/storage/GearTab.tsx`, `components/screens/storage/BulkSellBar.tsx`

**UI content (§8.1, §9.2):** a Drawer with Tabs Fish / Items / Gear.
- Fish: capacity bar `used kg / max kg` (+ "Upgrade" link to the Shop's Upgrades tab). Filters: species (select), rarity (chips), weight min–max (kg). Checkbox per row + "Select all filtered". Row: name, species, rarity, weight, mature badge, base value. Actions per row: Move to tank, open FishDrawer. BulkSellBar (sticky bottom when ≥ 1 selected): count, Sell/Release toggle, total from `/api/fish/sell/preview` (debounced 250 ms), Confirm → POST sell. The total shown is what the server returned, never computed client-side.
- Items: slot bar `used / max`. Stacks grouped by category with qty. Blindbox stacks have an "Open" button. Food stacks have "Move to hopper". No sell button anywhere (§8.1).
- Gear: each piece with category, tier, maxLoad (kg), a durability bar, "Broken" badge at 0, Repair (cost shown, Confirm), and "Equip" (sets loadout slot).

- [ ] **Step 1:** Implement. **Step 2:** typecheck clean.
- [ ] **Step 3: Browser verify:** filter + select-all + preview total equals the server response; selling refreshes coins once; with storage full, the blindbox Open shows `error.storage_full` with the needed kg from `detail`.
- [ ] **Step 4: Commit** `feat(ui): storage with fish/items/gear tabs and bulk sell`

### Task 17: Shop and upgrades

**Files:**
- Create: `components/screens/shop/ShopScreen.tsx`, `components/screens/shop/FishOffers.tsx`, `components/screens/shop/BlindboxOffers.tsx`, `components/screens/shop/ItemOffers.tsx`, `components/screens/shop/UpgradesTab.tsx`

**UI content (§8.2, §4.1, §8.1):** Tabs Fish / Blindbox / Items & Gear / Upgrades. Each card shows price, an "affordable" state, and the disabled reason (`not enough coins`, `storage needs X kg`, `level N required`).
- Fish cards: model thumbnail (static image from `public/thumbs/<modelKey>.webp`; generate with a one-off `scripts/render-thumbs.mjs` using the existing gltf + sharp tooling, or fall back to a rarity-coloured silhouette), rarity, weight range.
- Blindbox: odds table (species + %) shown before buying (transparency for the random purchase). After buying, a reveal Modal with the received fish and an "Open in storage" link.
- Upgrades: the four tracks with current → next value, cost and level requirement.
- Coins in the TopBar update from the response.

- [ ] **Step 1–2:** Implement; typecheck.
- [ ] **Step 3: Browser verify:** buying with storage full shows the error and the coins are unchanged; double-clicking Buy produces one purchase (the button disables while pending; the key is reused by `api` on retry).
- [ ] **Step 4: Commit** `feat(ui): shop with fish, blindbox odds, items, gear and upgrades`

### Task 18: Fishing — zones, loadout, trip, return home

**Files:**
- Create: `components/screens/fishing/ZonesScreen.tsx`, `components/screens/fishing/LoadoutPanel.tsx`, `components/screens/fishing/TripScreen.tsx`, `components/screens/fishing/ReturnHomeDialog.tsx`, `lib/client/useTrip.ts`

**Interfaces:**
- `useTrip(tripId: string): { cooler: TripFishDTO[]; coolerGrams: number; capacityGrams: number; bait: number; cast(): Promise<CastResult>; release(ids: string[]); returnHome(keepIds: string[]); cancel() }`: heartbeat every `tripTimeoutSec / 3` s; `pagehide` → `sendBeacon(cancel)`.

**UI content (§7):**
- Zones: cards with name, `minLevel`, unlock cost, locked/unlocked state, and the species pool with % (from `zone_species` weights + miss). Unlock → Confirm.
- LoadoutPanel: 5 slots (rod, line, hook, bait, cooler), each a select of owned items with durability; the effective load limit `min(rod,line,hook)` kg; a warning badge when the tiers are incompatible; Start Trip disabled with a reason if any slot is empty or broken.
- TripScreen (full-screen overlay; the tank scene stays mounted behind with a dim overlay): bait count, a "Buy bait" inline Stepper (POST `/api/shop/buy`), a Cast button with a short cast animation (CSS, ~1 s; the result comes from the server). Result card: miss / caught (species, weight, "fought!") / escaped (durability lost). Cooler list with total kg vs capacity and per-fish Release (25% coins shown). `cooler_full` → prompt to release.
- ReturnHomeDialog: checklist of cooler fish (default all), storage free kg vs selected kg; the Confirm button is disabled while selected > free, with the text "Release X kg more". Unselected rows show "+N coins (release)". No sell option (§7.4).
- Closing the overlay without Return → a Confirm warning that the catch will be lost → cancel.

- [ ] **Step 1–2:** Implement; typecheck.
- [ ] **Step 3: Browser verify:** a trip end to end against seed data. Reloading mid-trip returns to the Fishing screen with no active trip, and the fish from the cancelled trip appear in Collection as abandoned.
- [ ] **Step 4: Commit** `feat(ui): fishing zones, loadout, trip and return-home flow`

### Task 19: Rewards, quests, achievements, collection

**Files:**
- Create: `components/screens/rewards/RewardsScreen.tsx`, `components/screens/rewards/ClaimInbox.tsx`, `components/screens/rewards/QuestList.tsx`, `components/screens/rewards/LoginStreak.tsx`, `components/screens/rewards/Achievements.tsx`, `components/screens/collection/CollectionScreen.tsx`

**UI content (§6.1, §10, §9.3):**
- ClaimInbox: one card per claim (source label + fish name if any), parts listed with status, "Claim all" and per-part Claim. Blocked item parts show "Storage full — free a slot" with a link to Storage. Claimed parts show a check.
- QuestList: today's quests with progress bars and a reset countdown to `nextDayBoundary`; completed quests point to their claim.
- LoginStreak: streak count and the reward cycle strip with today's reward highlighted.
- Achievements: grid of all defs with progress `value / threshold` and completed state.
- Collection: Tabs Species (discovered vs undiscovered silhouettes, first-seen date/via) / History (every fish ever, status filter: alive, sold, released, lost, abandoned; row opens a read-only FishDrawer).

- [ ] **Step 1–2:** Implement; typecheck.
- [ ] **Step 3: Browser verify:** a partial claim with storage full leaves the item part pending and the bell count stays > 0.
- [ ] **Step 4: Commit** `feat(ui): reward inbox, daily quests, login streak, achievements and collection`

### Task 20: Admin pages

**Files:**
- Create: `app/admin/layout.tsx` (server component: `requireAdmin` → `notFound()` for non-admins), `app/admin/page.tsx` (species list), `app/admin/species/[key]/page.tsx`, `app/admin/milestones/page.tsx`, `app/admin/history/page.tsx`, `components/admin/SpeciesForm.tsx`, `components/admin/MilestoneEditor.tsx`, `components/admin/RewardBundleEditor.tsx`, `components/admin/ChangeLogTable.tsx`

**UI content (§6.2, §6.4, §12):** plain HTML tables + forms using the UI kit; no 3D. Desktop-first, but usable at 375px.
- Species list: key (read-only), name, rarity, max kg, active/deleted, buy price; filters active/inactive/deleted.
- SpeciesForm: all `Species` fields, including maturity reward (RewardBundleEditor) and sale bonus coins/%. Activate/Deactivate/Soft-delete buttons with Confirm. Save shows the server error verbatim on rollback.
- MilestoneEditor: default set + per-species override sets. Each row: weight (kg input → grams), reward bundle, delete. Every save asks for the pending policy (`keep` / `replace`) in a Confirm when the change affects existing pending claims (always ask; preview is optional per §6.2).
- History: union of species and milestone logs, newest first, with a before/after JSON diff (side-by-side `<pre>`), admin email, time, affected fish/claim counts.

- [ ] **Step 1–2:** Implement; typecheck.
- [ ] **Step 3: Browser verify** as an admin made with `node scripts/make-admin.mjs <email>`: change max weight, see the log entry with affected fish; a non-admin gets 404 at `/admin`.
- [ ] **Step 4: Commit** `feat(admin): species, milestone and change-history pages`

## Phase D — End-to-end and docs

### Task 21: E2E flows, test clock, decisions update

**Files:**
- Create: `playwright.config.ts` (webServer `npm run dev` with env `FISHORA_E2E=1`, `FISHORA_CONFIG_PROFILE=test`), `e2e/helpers.ts`, `e2e/main-loop.spec.ts`, `e2e/fishing.spec.ts`, `app/api/dev/advance/route.ts`, `app/api/dev/seed/route.ts`
- Modify: `package.json` (`"e2e": "playwright test"`, devDependency `@playwright/test`), `docs/decisions/README.md`, `docs/MVP_ROADMAP.md`, `FISHORA_PROJECT.md` (scope line)

**Interfaces:**
- `POST /api/dev/advance { hours }`: returns 404 unless `process.env.FISHORA_E2E === '1'`. Moves the caller's `tank.simulatedUntil`, `fish.reviveDeadline` and `fishing_trips.lastSeenAt` back by `hours` (equivalent to time passing).
- `POST /api/dev/seed { coins?, storageFull? }`: same guard. Runs `seedTestContent()` and sets coins / fills storage for the signed-in test user.

- [ ] **Step 1: Write `e2e/main-loop.spec.ts`** (§14): register → buy `t_guppy` → it appears in Storage → move to tank → buy food → feed → `dev/advance` enough hours for the 1 kg test milestone → the bell shows 1 → claim → sell the fish from Storage → coins equal start − price − food + milestone coins + base value (asserted from API responses, not hard-coded).
- [ ] **Step 2: Write `e2e/fishing.spec.ts`** (§14): seed `storageFull` → unlock zone → equip → start trip → cast until a catch (test zone `missWeight 0`) → Return Home shows "Release X kg more" and Confirm is disabled → deselect until it fits → confirm → kept fish in Storage, released coins credited. A second test: reload mid-trip → the fish shows as abandoned in Collection.
- [ ] **Step 3:** `npx playwright install chromium && npm run e2e` → both specs PASS. Also run `npm test` (full suite) → PASS, and `npm run typecheck`, `npm run build` → clean.
- [ ] **Step 4: Update docs:** in `docs/decisions/README.md`, move R-002/R-008 to superseded by the BA spec. Add Resolved rows for D-020..D-024 (care model = HP + satiety ticks + dirt thresholds; death enabled with the 14-day revive), D-072 (React context, no state library), D-079 (on-demand catch-up simulation under a per-player row lock). Add **Assumed** rows for each formula shape in this plan (base value, revive cost, growth/hunger per tick, fight success, blindbox capacity checked against max weight, reserve hopper not counted in item slots, cast blocked while cooler over capacity). Add **Open** rows for every §15 TBD value, pointing to `prisma/seed/placeholder-balance.ts`. In `MVP_ROADMAP.md`, mark the Phase 4–6 sections as replaced by this plan.
- [ ] **Step 5: Commit** `test(e2e): main loop and fishing flows; record MVP decisions`

---

## Spec coverage map

| Spec | Tasks |
|---|---|
| §3 fish individuals, value, rarity, rename | 1, 4, 7, 15 |
| §4 tank capacity, feeding, auto-feed, dirt, cleaning | 3, 5, 6, 7, 9, 15 |
| §5 states, death, revive, 14-day window | 5, 6, 10, 15 |
| §6.1–6.3 milestones, maturity, sale bonus | 4, 8, 10, 13, 19 |
| §6.2, §6.4, §12 admin + change history | 13, 20 |
| §7 fishing, gear, durability, trip lifecycle | 11, 18 |
| §8 storage, shop, blindbox, items | 3, 9, 16, 17 |
| §9 sell/release/bulk/collection | 10, 12, 16, 19 |
| §10 coins, EXP, quests, login, achievements | 3, 12, 19 |
| §11 offline simulation and integrity | 3, 5, 6 |
| §13 edge cases | tests in 3, 6–13 |
| §14 unit/integration/E2E | every task + 21 |
| §15 TBD values | config + seed (1, 2), tracker (21) |
