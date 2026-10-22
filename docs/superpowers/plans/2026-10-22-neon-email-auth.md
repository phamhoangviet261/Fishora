# Phase 3 Backend: Neon Database, Email Login, Wallet, Inventory, Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver MVP_ROADMAP Phase 3 on Neon: email + password accounts, server-authoritative wallet with transaction history, inventory with owned-vs-placed tracking, and aquarium layout save/restore.

**Architecture:** Prisma ORM talks to Neon (pooled URL at runtime, unpooled URL for migrations). Auth is done by our own Next.js Route Handlers under `app/api/auth/*`: passwords are hashed with bcrypt, and the session is a stateless signed JWT in an httpOnly cookie, so every request authenticates on its own (TECHNICAL_ARCHITECTURE.md principle 9). The HUD Settings modal gets an Account section with the login/register form.

**Tech Stack:** Next.js 15 Route Handlers, Prisma 6 + `@prisma/client`, Neon Postgres, `bcryptjs`, `jose`, Vitest.

**Spec:** this conversation's request ("dựng database cho project, user login bằng email", answered: email + password) plus `docs/TECHNICAL_ARCHITECTURE.md` (Prisma, stateless requests, server-side validation) and `docs/decisions/README.md` (D-070, D-071, D-074).

## Global Constraints

- ORM is Prisma (TECHNICAL_ARCHITECTURE.md: "PostgreSQL + Prisma ORM").
- Schema covers only Phase 3 needs: `users` (with `coins`, `tankType`), `coin_transactions`, `inventory_items`. No care, egg, quest or level tables (Phase 5–6).
- Starting grant on registration (D-040, using the prototype's values): 250 coins and the current tank's fish (`fishGroups()` from `lib/fishSpecies.ts`, one inventory row per fish, all placed), in the same DB transaction as user creation, logged as a `starting_grant` coin transaction.
- Every coin change writes a `coin_transactions` row with `amount` and `balanceAfter` in the same DB transaction; `users.coins` can never go below 0 (DB `CHECK`).
- Coin-spending requests carry an `Idempotency-Key` header; a repeat with the same key returns the first result and charges nothing (unique `(userId, idempotencyKey)`).
- Water change costs `WATER_CHANGE_COST` = 5 coins (existing constant).
- Secrets live only in `.env.local` (already git-ignored by `.env*.local`). Never commit a connection string or `AUTH_SECRET`; `.env.example` holds placeholder names only.
- Runtime env vars used: `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct, for migrations), `AUTH_SECRET` (≥ 32 random bytes, base64).
- Email: trimmed, lowercased, ≤ 254 chars, must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- Password: 8–72 bytes UTF-8 (72 is bcrypt's input limit). bcrypt cost 12.
- Session cookie: name `fishora_session`, `httpOnly`, `sameSite: 'lax'`, `secure` in production, `path: '/'`, max age 30 days; JWT HS256 with `sub` = user id, `exp` = 30 days.
- API error codes (JSON body `{ error: <code> }`): `invalid_email` 400, `weak_password` 400, `email_taken` 409, `invalid_credentials` 401, `unauthenticated` 401.
- UI copy goes through `lib/i18n.tsx` in both `vi` and `en`.
- Files keep LF line endings (the repo stores LF).

## Review Focus

- Same email in different case or with spaces (`A@x.com ` vs `a@x.com`) must hit one account: register returns `email_taken`, login succeeds. Test in Task 2 and Task 4.
- Unknown email and wrong password must give the identical `invalid_credentials` response, so login can't be used to probe which emails exist. Test in Task 4.
- Two registrations of the same email racing each other: the DB unique constraint (Prisma `P2002`) must map to `email_taken`, not a 500. Test in Task 4.
- A tampered, expired or garbage `fishora_session` cookie must read as logged out, never throw. Test in Task 3.
- A password over 72 bytes (e.g. long Vietnamese text with diacritics) must be rejected with `weak_password`, not silently truncated by bcrypt. Test in Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | Datasource (Neon) + `User` model |
| `lib/db.ts` | PrismaClient singleton (survives Next dev hot reload) |
| `lib/auth/credentials.ts` | Validate/normalise email + password input |
| `lib/auth/password.ts` | bcrypt hash/verify |
| `lib/auth/session.ts` | JWT sign/verify, cookie set/clear, `getCurrentUser()` |
| `lib/auth/service.ts` | `registerUser` / `loginUser`: DB + rules, no HTTP |
| `app/api/auth/{register,login,logout,me}/route.ts` | Thin HTTP wrappers over service + session |
| `lib/auth/useAuth.ts` | Client hook: current user, login, register, logout |
| `components/hud/AccountSection.tsx` | Login/register form + logged-in view, inside SettingsModal |
| `vitest.config.ts`, `tests/**` | Unit + DB integration tests |
| `.env.example` | Placeholder env var names |

---

### Task 1: Prisma + Neon connection and `User` table

**Files:**
- Create: `prisma/schema.prisma`, `lib/db.ts`, `.env.example`, `vitest.config.ts`, `tests/db.test.ts`
- Modify: `package.json` (deps + scripts)

**Interfaces:**
- Produces: `prisma` export from `lib/db.ts` (a `PrismaClient`); model `User { id String @id @default(cuid()); email String @unique; passwordHash String; createdAt DateTime @default(now()) }`; npm scripts `test` (`vitest run`), `db:migrate` (`prisma migrate dev`), `db:deploy` (`prisma migrate deploy`), `postinstall` (`prisma generate`).

- [ ] **Step 1: Put the Neon credentials in `.env.local`** (never committed) with `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `AUTH_SECRET` (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). Write `.env.example` with the same three names and empty values. Since the Neon password was pasted into chat, rotate it in the Neon console first and use the new one.

- [ ] **Step 2: Install** `prisma`, `vitest`, `dotenv-cli` (dev) and `@prisma/client`, `bcryptjs`, `jose` (runtime); `@types/bcryptjs` (dev). Add the scripts above. Prisma reads `.env`, not `.env.local`, so the db scripts run through `dotenv -e .env.local -- prisma ...`.

- [ ] **Step 3: Write `prisma/schema.prisma`**: `provider = "postgresql"`, `url = env("DATABASE_URL")`, `directUrl = env("DATABASE_URL_UNPOOLED")`, and the `User` model above with `@@map("users")`.

- [ ] **Step 4: Write `lib/db.ts`**: one `PrismaClient`, cached on `globalThis` outside production.

- [ ] **Step 5: Write the failing test** `tests/db.test.ts`

```ts
import { prisma } from '@/lib/db';
test('can reach the database', async () => {
  const rows = await prisma.$queryRaw<{ ok: number }[]>`select 1 as ok`;
  expect(rows[0].ok).toBe(1);
});
afterAll(() => prisma.$disconnect());
```

`vitest.config.ts`: `globals: true`, alias `@` → project root, load `.env.local` via `dotenv` in `setupFiles`, and `environment: 'node'`.

- [ ] **Step 6: Run** `npm test -- tests/db.test.ts`. Expected: PASS (it fails first only if `.env.local` is missing).

- [ ] **Step 7: Create the table** `npm run db:migrate -- --name init_users`. Expected: `prisma/migrations/<ts>_init_users/migration.sql` with `CREATE TABLE "users"` and a unique index on `email`.

- [ ] **Step 8: Commit** `prisma/`, `lib/db.ts`, `.env.example`, `vitest.config.ts`, `tests/db.test.ts`, `package.json`, `package-lock.json`. Run `git status` first and confirm `.env.local` is not staged.

---

### Task 2: Credential validation and password hashing

**Files:**
- Create: `lib/auth/credentials.ts`, `lib/auth/password.ts`, `tests/auth/credentials.test.ts`, `tests/auth/password.test.ts`

**Interfaces:**
- Produces:
  - `type Credentials = { email: string; password: string }`
  - `parseCredentials(input: unknown): { ok: true; value: Credentials } | { ok: false; error: 'invalid_email' | 'weak_password' }`
  - `normalizeEmail(email: string): string` (trim + lowercase)
  - `hashPassword(password: string): Promise<string>` / `verifyPassword(password: string, hash: string): Promise<boolean>`

- [ ] **Step 1: Write failing tests** in `tests/auth/credentials.test.ts`:
  - `parseCredentials({ email: '  A@Fish.io ', password: 'secret123' })` → `{ ok: true, value: { email: 'a@fish.io', password: 'secret123' } }`
  - `email: 'not-an-email'` → `error: 'invalid_email'`; `email` of 255 chars → `invalid_email`; missing/non-string fields or `input = null` → `invalid_email`
  - `password: 'short'` (5) → `weak_password`; `'a'.repeat(73)` → `weak_password`; `'ệ'.repeat(25)` (75 bytes) → `weak_password`; `'a'.repeat(72)` → ok
  
  In `tests/auth/password.test.ts`: `verifyPassword('secret123', await hashPassword('secret123'))` is `true`; with `'secret124'` is `false`; the hash starts with `$2` and contains `$12$`.

- [ ] **Step 2: Run** `npm test -- tests/auth`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement** both files. Byte length via `new TextEncoder().encode(password).length`; bcrypt via `bcryptjs` `hash(password, 12)` / `compare`.

- [ ] **Step 4: Run** `npm test -- tests/auth`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(auth): credential validation and bcrypt hashing`.

---

### Task 3: Stateless session (JWT cookie)

**Files:**
- Create: `lib/auth/session.ts`, `tests/auth/session.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1).
- Produces:
  - `SESSION_COOKIE = 'fishora_session'`, `SESSION_MAX_AGE = 60 * 60 * 24 * 30`
  - `signSession(userId: string, now?: Date): Promise<string>`
  - `verifySession(token: string | undefined, now?: Date): Promise<string | null>` (user id or null; never throws)
  - `setSessionCookie(res: NextResponse, token: string): void` / `clearSessionCookie(res: NextResponse): void`
  - `getCurrentUser(): Promise<{ id: string; email: string } | null>` (reads `cookies()` from `next/headers`, verifies, loads the user; null if the user no longer exists)

- [ ] **Step 1: Write failing tests** (set `process.env.AUTH_SECRET` in the test if absent):
  - round trip: `verifySession(await signSession('u1'))` → `'u1'`
  - expired: sign at `now = 2026-01-01`, verify at `2026-03-01` → `null`
  - tampered: change the last char of the token → `null`
  - `verifySession(undefined)` and `verifySession('garbage')` → `null`
  - signed with a different secret → `null`
  - `setSessionCookie` on a `NextResponse` sets `fishora_session` with `httpOnly`, `sameSite=lax`, `path=/`, `maxAge=2592000`

- [ ] **Step 2: Run** `npm test -- tests/auth/session.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** with `jose` `SignJWT`/`jwtVerify` (HS256, key = base64-decoded `AUTH_SECRET`, `currentDate: now` option for testability). Throw at first use if `AUTH_SECRET` is missing or decodes to fewer than 32 bytes.

- [ ] **Step 4: Run** the tests. Expected: PASS.

- [ ] **Step 5: Commit** `feat(auth): stateless JWT session cookie`.

---

### Task 4: Register / login service and API routes

**Files:**
- Create: `lib/auth/service.ts`, `app/api/auth/register/route.ts`, `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/me/route.ts`, `tests/auth/service.test.ts`

**Interfaces:**
- Consumes: `parseCredentials`, `normalizeEmail`, `hashPassword`, `verifyPassword` (Task 2); `signSession`, `setSessionCookie`, `clearSessionCookie`, `getCurrentUser` (Task 3); `prisma` (Task 1).
- Produces:
  - `type PublicUser = { id: string; email: string }`
  - `registerUser(input: unknown): Promise<{ ok: true; user: PublicUser } | { ok: false; error: 'invalid_email' | 'weak_password' | 'email_taken' }>`
  - `loginUser(input: unknown): Promise<{ ok: true; user: PublicUser } | { ok: false; error: 'invalid_credentials' }>`
  - HTTP: `POST /api/auth/register` → 201 `{ user }` + cookie; `POST /api/auth/login` → 200 `{ user }` + cookie; `POST /api/auth/logout` → 204, cookie cleared; `GET /api/auth/me` → 200 `{ user }` or 401 `{ error: 'unauthenticated' }`. Errors use the codes/statuses in Global Constraints. Bodies are JSON; an unparsable body is treated as `input = null`.

- [ ] **Step 1: Write failing tests** in `tests/auth/service.test.ts` against the real DB, using emails `test+<random>@fishora.test` and deleting them in `afterEach`:
  - `registerUser({ email: 'Test+X@Fishora.test', password: 'secret123' })` → ok, stored email lowercase, `passwordHash !== 'secret123'`
  - registering ` test+x@fishora.test` again (spaces/case) → `email_taken`
  - `Promise.all` of two registrations with the same email → exactly one ok, the other `email_taken`
  - `loginUser` with right password (any case/spacing of email) → ok; wrong password → `invalid_credentials`; unknown email → `invalid_credentials` (deep-equal to the wrong-password result)
  - `registerUser({ email: 'bad', password: 'secret123' })` → `invalid_email`

- [ ] **Step 2: Run** `npm test -- tests/auth/service.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `service.ts`**. `email_taken` comes from catching Prisma error code `P2002`, not from a read-then-write check. For an unknown email in `loginUser`, still run `verifyPassword` against a fixed dummy bcrypt hash so the response time matches the wrong-password path.

- [ ] **Step 4: Implement the four route handlers** as thin wrappers (`export const runtime = 'nodejs'`; parse JSON in try/catch; map result to status + body; set/clear cookie).

- [ ] **Step 5: Run** `npm test`. Expected: all PASS.

- [ ] **Step 6: Smoke-test the HTTP layer** with the dev server running:

```bash
curl -i -c jar -H "content-type: application/json" -d "{\"email\":\"smoke@fishora.test\",\"password\":\"secret123\"}" http://localhost:3000/api/auth/register
curl -i -b jar http://localhost:3000/api/auth/me
```

Expected: `201` with `set-cookie: fishora_session=...; HttpOnly; SameSite=Lax`, then `200 {"user":{"id":...,"email":"smoke@fishora.test"}}`. Delete the smoke user afterwards.

- [ ] **Step 7: Record the decisions** in `docs/decisions/README.md`: D-070 → Decided: email + password; D-071 → Decided: stateless JWT in httpOnly cookie; D-074 → Decided: Neon. In `docs/TECHNICAL_ARCHITECTURE.md`, change the database row from "Proposed" to "Decided (Neon)".

- [ ] **Step 8: Commit** `feat(auth): register, login, logout and me endpoints`.

---

### Task 5: Account UI in Settings

**Files:**
- Create: `lib/auth/useAuth.ts`, `components/hud/AccountSection.tsx`
- Modify: `components/hud/SettingsModal.tsx` (render `<AccountSection />` as the first section), `components/hud/Hud.module.css` (form styles in the existing cozy UI kit), `lib/i18n.tsx` (new keys)

**Interfaces:**
- Consumes: the HTTP endpoints from Task 4.
- Produces: `useAuth(): { user: PublicUser | null; loading: boolean; error: string | null; login(email: string, password: string): Promise<boolean>; register(email: string, password: string): Promise<boolean>; logout(): Promise<void> }` (calls `/api/auth/me` on mount; `error` holds the API error code).

- [ ] **Step 1: Add i18n keys** (vi / en):
  - `account.title`: Tài khoản / Account
  - `account.email`: Email / Email
  - `account.password`: Mật khẩu / Password
  - `account.login`: Đăng nhập / Log in
  - `account.register`: Tạo tài khoản / Create account
  - `account.logout`: Đăng xuất / Log out
  - `account.switchToRegister`: Chưa có tài khoản? / No account yet?
  - `account.switchToLogin`: Đã có tài khoản? / Already have an account?
  - `account.signedInAs`: Đang đăng nhập: {email} / Signed in as {email}
  - `account.error.invalid_email`: Email không hợp lệ / That email doesn't look right
  - `account.error.weak_password`: Mật khẩu cần 8–72 ký tự / Password must be 8–72 characters
  - `account.error.email_taken`: Email này đã có tài khoản / That email already has an account
  - `account.error.invalid_credentials`: Sai email hoặc mật khẩu / Wrong email or password
  - `account.error.network`: Không kết nối được máy chủ / Couldn't reach the server

- [ ] **Step 2: Implement `useAuth`** and `AccountSection`: logged out → email + password inputs (`type="email"`, `autoComplete` `email` / `current-password` or `new-password`), a submit button that toggles between login and register mode, error text from `account.error.<code>`; logged in → `account.signedInAs` + logout button. Disable the submit while a request is in flight. A fetch failure maps to `network`.

- [ ] **Step 3: Verify in the browser** (dev server, Settings modal): register a new `ui+<n>@fishora.test` account → shows "Signed in as"; reload → still signed in; log out → form returns; log in with wrong password → "Wrong email or password"; register the same email again → "That email already has an account". Check both languages and a 375 px wide viewport. Delete the test users afterwards.

- [ ] **Step 4: Run** `npm run typecheck && npm test`. Expected: no errors, all tests PASS.

- [ ] **Step 5: Commit** `feat(hud): account section with email login`.

---

### Task 6: Schema for wallet, transactions, inventory + starting grant

**Files:**
- Modify: `prisma/schema.prisma`, `lib/auth/service.ts`, `tests/auth/service.test.ts`
- Create: `lib/game/catalog.ts`, migration `wallet_inventory`

**Interfaces:**
- Produces:
  - `User` gains `coins Int @default(0)`, `tankType String @default("planted120")`, relations.
  - `CoinTransaction { id, userId, amount Int, balanceAfter Int, reason String, idempotencyKey String?, createdAt; @@unique([userId, idempotencyKey]) }` → table `coin_transactions`.
  - `InventoryItem { id, userId, kind String ('fish' | 'decor'), itemKey String, placed Boolean @default(false), posX Float?, posY Float?, posZ Float?, rotY Float?, createdAt }` → table `inventory_items`, index on `userId`.
  - `lib/game/catalog.ts`: `STARTING_COINS = 250`, `isKnownItem(kind, itemKey): boolean` (fish = species ids in `TANK_FISH`; decor = Poly Haven asset ids in `public/models/scape`), `startingFish(): string[]` (species ids expanded by count).
  - `registerUser` now creates user + grant inside `prisma.$transaction`.

- [ ] **Step 1: Failing test**: after `registerUser`, the user has `coins === 250`, exactly one `coin_transactions` row `{ amount: 250, balanceAfter: 250, reason: 'starting_grant' }`, and inventory rows equal in number to `startingFish().length`, all `kind: 'fish'`, `placed: true`.
- [ ] **Step 2: Run**, expect FAIL. **Step 3:** update schema, add `ALTER TABLE users ADD CONSTRAINT coins_non_negative CHECK (coins >= 0)` to the generated migration SQL, implement. **Step 4:** run, expect PASS. **Step 5: Commit** `feat(db): wallet, transactions, inventory and starting grant`.

### Task 7: Player, wallet, inventory, layout and water-change APIs

**Files:**
- Create: `lib/game/wallet.ts`, `lib/game/inventory.ts`, `app/api/player/route.ts`, `app/api/wallet/transactions/route.ts`, `app/api/inventory/route.ts`, `app/api/aquarium/layout/route.ts`, `app/api/care/water-change/route.ts`, `lib/api.ts`, tests in `tests/game/`

**Interfaces:**
- Produces:
  - `spendCoins(userId: string, amount: number, reason: string, idempotencyKey: string): Promise<{ ok: true; balance: number } | { ok: false; error: 'insufficient_coins' }>` — single conditional `UPDATE users SET coins = coins - $1 WHERE id = $2 AND coins >= $1` + ledger row in one transaction; a `P2002` on the idempotency key returns the original row's `balanceAfter` as success.
  - `listTransactions(userId, limit = 50)` newest first (limit clamped 1–200).
  - `listInventory(userId)`; `saveLayout(userId, items: LayoutEntry[])` where `LayoutEntry = { id: string; placed: boolean; pos?: [number, number, number]; rotY?: number }` → `{ ok: true } | { ok: false; error: 'not_owned' | 'invalid_layout' }`. All ids must belong to the user (else `not_owned`, nothing written); positions must be finite and inside `INNER` x/z and `FLOOR_Y`..`WATER_Y` (else `invalid_layout`); fish ignore `pos`/`rotY`. Writes in one transaction.
  - `lib/api.ts`: `requireUser()` → user or a 401 `NextResponse`; `json(status, body)`.
  - Routes (all require login, 401 `unauthenticated` otherwise): `GET /api/player` → `{ user, coins, tankType }`; `GET /api/wallet/transactions?limit=` → `{ transactions }`; `GET /api/inventory` → `{ items }`; `GET /api/aquarium/layout` → `{ tankType, items }` (placed only); `PUT /api/aquarium/layout` body `{ items: LayoutEntry[] }` → 200 / 400 `invalid_layout` / 403 `not_owned`; `POST /api/care/water-change` (header `Idempotency-Key`, 400 `missing_idempotency_key` if absent) → `{ coins }` or 409 `insufficient_coins`.

- [ ] **Step 1: Failing tests**: spend 5 → balance 245 and ledger row `-5 / 245`; same key twice → balance 245, one row; 60 parallel distinct-key spends of 5 from 250 → exactly 50 succeed, final 0, never negative; spend with 3 coins left → `insufficient_coins`, no row; `saveLayout` with another user's item id → `not_owned` and nothing changed; decor pos outside tank or `NaN` → `invalid_layout`; unplacing a fish keeps the inventory row (ownership kept) and `GET layout` omits it.
- [ ] **Step 2: Run**, FAIL. **Step 3:** implement. **Step 4:** run, PASS. **Step 5:** curl smoke of each route with a session cookie. **Step 6: Commit** `feat(api): player, wallet, inventory, layout and water-change endpoints`.

### Task 8: HUD uses the server when signed in

**Files:**
- Modify: `lib/game/useGameState.ts`, `components/FishoraStage.tsx`, `components/hud/AccountSection.tsx` (shows recent transactions)

**Interfaces:**
- Consumes: Task 7 endpoints, `useAuth` (Task 5).
- Produces: when a user is signed in, `state.coins` comes from `GET /api/player`, `state.fish` from placed fish in `GET /api/aquarium/layout` (grouped by species), and `changeWater()` calls `POST /api/care/water-change` with a fresh `crypto.randomUUID()` key, applying the local care effect only after a 200. Signed out keeps today's local-only prototype behaviour.

- [ ] **Step 1:** implement. **Step 2: Verify in browser**: register → HUD shows 250 coins and 31 fish; Change water → 245, reload → still 245; transaction list shows `starting_grant +250`, `water_change -5`; log out → local prototype values return. **Step 3:** `npm run typecheck && npm test`. **Step 4: Commit** `feat(hud): server-backed coins and fish when signed in`.

## Out of scope (follow-up plans)

- Password reset / email verification (needs an email-sending service).
- Shop purchases and selling (Phase 4); care state, eggs, quests (Phase 5–6). Care stats stay client-side for now.
- Rate limiting on `/api/auth/*` (TECHNICAL_ARCHITECTURE.md lists it; strategy is still TBD under D-071 notes).
