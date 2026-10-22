# Fishing MVP (reeling minigame) — Audit and Plan

Request: "BA Implementation — Fishora Fishing System" (pasted task, 2026-10-22). It builds on the fishing backend already on `feat/mvp-core` (plan `2026-10-22-mvp-schema-and-ui.md`, Task 11/18) and on the BA spec `docs/specs/2026-10-22-fishora-ba-mvp.md` §7.

## 1. Repository audit

| Area | What exists (verified) | Reuse |
|---|---|---|
| Framework | Next.js 15 App Router (`app/`), React 19, R3F 9 + three 0.180 + postprocessing. Single page `/` renders `components/FishoraStage.tsx` (3D tank + HUD overlay). | New route `app/fishing/page.tsx` with the same providers. |
| Fish catalog | `species` table (content profile `live`/`test`): key, displayName, rarity, `modelKey` → GLB in `lib/fishSpecies.ts` (`TANK_FISH`, 31 models: betta + Coral Bay pack), spawn weight/age, `valuePerKg`, buyPrice. Rarity enum `common < uncommon < rare < epic < legendary` (`lib/game/types.ts RARITIES`). Value: `computeBaseValue` (rarity multiplier × weight/age), fixed at creation. | Species + rarity + value as-is; card renders the species' GLB. |
| Inventory/items | `item_defs` (category food/bait/cleaning/revive/blindbox/rod/line/hook/cooler, `stats` JSON), stacks `inventory_stacks` (bait is a stack), gear pieces `gear_items` with durability, `gear_loadouts` (rodId/lineId/hookId/coolerId/baitKey). Coins: `users.coins` + append-only `coin_transactions`, `adjustCoins`. | Rod = `rod` gear, bait = `bait` stack, container = `cooler` gear (`stats.capacityGrams`). |
| Maps | `zones` + `zone_species` (per-zone weighted pools, `missWeight`), `unlocked_zones`; placeholder seed has 3 zones. | Already one pool per map → add a 4th map in the seed. |
| Shop | `GET /api/shop`, `POST /api/shop/buy`, `ShopScreen` drawer (`open('shop', tab)`). | "Open shop" button → shop drawer. |
| Fishing today | Trips (`fishing_trips`) = carried cooler; `cast` decides catch instantly on the server; `returnHome` moves kept fish to storage atomically (conditional status flip + storage check) and releases the rest at 25%; trips are cancelled (catch lost) on page load / heartbeat timeout; Fishing drawer + Trip modal UI. | Keep trips, cooler, returnHome, release, repair; replace instant cast with attempts + reeling; change lifecycle (catches survive refresh). |
| Persistence/auth | Prisma 6 on Neon Postgres; email+password JWT cookie; every mutation goes through `withPlayer` (row lock per player + world catch-up + `operations` idempotency) via `playerAction`/`playerRead` in `lib/api.ts`; `Idempotency-Key` header required. | Same conventions for the new routes. |
| UI | `components/ui` kit (Panel, Button, Badge, ProgressBar, Modal, Drawer, Tabs, Field, Stepper, Countdown, Confirm), CSS modules, i18n `lib/i18n.tsx` + `lib/i18nGame.ts` (en/vi), `GameProvider` (snapshot + screen nav), `useAction`. No animation library (CSS + R3F `useFrame`). No audio system. | Same kit; bite cue = visual + a WebAudio beep (no new dependency). |
| Tests/tooling | Vitest (real DB, `tests/`), Playwright (`e2e/`, server on :3200 with `FISHORA_E2E=1`, dev time-travel/seed routes), `npm run typecheck`, `npm run build`. **No ESLint configured** (no lint script). | Add unit + integration + E2E. |

Blockers: none. Missing assets: no rod/lake models and no sounds → rod, line, bobber and lake are built from primitives/canvas textures; bite sound synthesised with WebAudio.

## 2. Decisions (conflicts resolved against the newest instruction)

- **Catches survive refresh** (new task "confirmed behavior") — replaces BA §7.4 "leaving loses uncollected fish". Leaving cancels only the unfinished *attempt*; the trip/cooler stays open until "Return to shore". The heartbeat-timeout trip cancel is removed; attempts expire instead.
- **Equipment = rod + bait + container.** Line and hook stay in the data model but are no longer required to fish (the reeling minigame replaces the load-limit fight). Rod durability still drops on a catch (`catchDurabilityLoss`) and on an escape (`fightFailDurabilityLoss`); a broken rod can't fish and can be repaired.
- **Server-authoritative reeling.** The reel simulation is a pure, seeded, fixed-tick function (`lib/game/fishing/reel.ts`). The client plays it live and records the cursor per tick; the server replays the same function on resolve and decides caught/escaped. Client-claimed success, species, rarity, weight and value are never trusted.
- **Fish chosen at attempt start, revealed at catch.** The server picks bite/no-bite (`missWeight`), species (zone pool filtered by rod `maxRarity`, configured weights × bait multipliers) and weight when the attempt starts; the client only gets difficulty parameters.
- **Bait:** one unit per attempt, taken when the attempt starts (idempotent by key). Not refunded on no-bite, escape or cancel (BA §7.3: "mất mồi kể cả khi không câu được").
- **Container capacity** is by weight (`capacityGrams`). An attempt may start only if the free space fits the heaviest eligible fish of that map/rod, so a catch never overflows; otherwise "Container full — return to shore". The container can't be swapped while it holds fish.
- **Four maps:** placeholder seed gains a 4th zone; each keeps its own pool (all four may reference the same species).
- **Navigation:** the existing Dock "Fishing" button (there is no separate Home "Go Fishing" button) goes to `/fishing`.

## 3. State machine (client, `lib/game/fishing/machine.ts`, pure)

`prep → charging → (release) casting → waiting → bite → reeling → caught | escaped | nothing → result → prep`, plus `error`. Transient; never persisted. Persistent state = trip, attempt row, cooler fish.

## 4. Implementation steps

1. Config `fishing.reel` (+ rarity difficulty table, wait range, tick) and rod stats `maxRarity/catchMult/stability`; seed + test content.
2. Pure modules + unit tests: `reel.ts` (simulate/replay), `select.ts` (eligible pool, weighted pick, capacity need), `machine.ts`.
3. `fishing_attempts` table; `startAttempt` / `resolveAttempt` / `cancelAttempt` / expiry; lifecycle change (catches persist); container rules; routes.
4. `/fishing` page: prep (maps, rod/bait/container, owned items, shop), session HUD (patience bar top, progress + power bars right), first-person R3F scene (lake, rod, line, bobber, rod/line follow fish), bite cue, catch card with flip + species model, return to shore.
5. Tests: unit, integration (DB), E2E (navigation, prep, cast→wait→reel UI, catch via API-replayed perfect input, persistence across reload, return to shore, duplicate resolve).
