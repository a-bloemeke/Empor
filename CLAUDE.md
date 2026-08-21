# Empor — project instructions

## Deployment

After every code change (new feature, fix, refactor), immediately commit and push to the `dev` branch.
Vercel auto-deploys `dev` to https://web-git-dev-empor-team.vercel.app — pushing is how changes become visible.

Do not wait to be asked. Commit + push is part of completing any task.

To release to production: merge `dev` → `main` and push. Then run pending DB migrations against prod (see Databases below).

---

## Databases (Neon PostgreSQL, eu-central-1)

| File | DB branch | Used by |
|---|---|---|
| `web/.env.local` | `ep-billowing-queen-...` | Dev/preview (web-git-dev-empor-team.vercel.app) |
| `web/.env` | `ep-autumn-base-...` | Production (empor-lichtenberg.vercel.app) |

`web/prisma.config.ts` loads `.env.local` first with `override: true` — all local `npx prisma` commands always target **dev DB**. To run against prod, temporarily move `.env.local` aside:

```bash
# Check / apply migrations on prod
mv .env.local .env.local.bak
DATABASE_URL="<prod-url>" npx prisma migrate status
DATABASE_URL="<prod-url>" npx prisma migrate deploy
mv .env.local.bak .env.local
```

### Migration rules
- Adding enum values: Prisma generates empty SQL — use `--create-only`, write `ALTER TYPE ... ADD VALUE 'X'` manually, apply with `migrate deploy` (never `migrate dev` — runs in transaction which PostgreSQL forbids for enum additions).
- Always migrate dev first, verify on preview, then migrate prod.
- After schema changes: `npx prisma generate` to regenerate client (output: `web/src/generated/prisma/`).

---

## Stack

- **Next.js 16** (app router, Turbopack) — `web/` directory
- **Prisma 7** ORM — schema at `web/prisma/schema.prisma`, client at `web/src/generated/prisma/`
- **NextAuth** — roles: `ORGANIZER` | `PLAYER`. Auth config: `web/src/auth.ts`
- **Nodemailer** SMTP — all email in `web/src/lib/email.ts`
- **bcryptjs** — password hashing for player accounts
- **base-ui** + shadcn/ui components — `web/src/components/ui/`
- **Tailwind CSS** — amber = admin/organizer UI convention
- **next-intl** — i18n, German only in practice
- **Sonner** — toast notifications

---

## Data model (key models)

```
Season (year, ACTIVE|COMPLETED)
  └── Session (date, SCHEDULED|IN_PROGRESS|COMPLETED|CANCELLED, maxPlayers=12)
        ├── SessionRegistration (status: REGISTERED|CANCELLED|MAYBE|PENDING|WAITLISTED)
        ├── Team → TeamPlayer → Player
        └── Match → Goal

Player (email, passwordHash?, role: ORGANIZER|PLAYER, active, emailNotifications)
PlayerStats (per season: goals, assists, score, points, sessionsPlayed, matchesPlayed, beers)
PlayerStatsLifetime (same fields, lifetime totals)
AppConfig (key/value: "emailFrom", "requireApproval")
PlayerAbsence (startDate, endDate — hides player from "no answer" lists)
HallClosure (startDate, endDate, reason? — blocks session creation on that date; shown in /schedule within 2 weeks)
```

`passwordHash = null` means guest player (added by organizer, cannot log in).

---

## Registration status flow

```
(new) → PENDING   (if requireApproval=true)  → REGISTERED (approved) or CANCELLED (rejected)
(new) → WAITLISTED (if session full, cap=maxPlayers??12)  → REGISTERED (auto-promote on cancel)
(new) → REGISTERED
REGISTERED → CANCELLED (self: 1h cutoff; organizer: anytime) → auto-promotes oldest WAITLISTED
```

---

## Key files

### App routes
| Route | Files |
|---|---|
| `/schedule` | `schedule/page.tsx`, `schedule/actions.ts`, `schedule-client.tsx` |
| `/anleitung` | `anleitung/page.tsx` — static German player how-to guide; mirrors `public/spieler-anleitung.txt` (email attachment). Public route (in `auth.ts` allowlist), linked from homepage hero. |
| `/sessions/[id]` | `sessions/[id]/page.tsx`, `actions.ts`, `session-client.tsx` |
| `/sessions/[id]/scoreboard` | `(fullscreen)/sessions/[id]/scoreboard/page.tsx`, `scoreboard-client.tsx` |
| `/admin/settings` | `admin/settings/page.tsx`, `actions.ts`, `settings-client.tsx` |
| `/admin/closures` | `admin/closures/` — hall closure periods |
| `/admin/players` | `admin/players/` |
| `/admin/membership` | `admin/membership/` |
| `/leaderboard` | `leaderboard/` |
| `/players/[id]` | `players/[id]/` |

### Lib
| File | Purpose |
|---|---|
| `lib/email.ts` | All transactional email — see functions below |
| `lib/stats.ts` | `computeAndSaveStats(sessionId)` — called after `endSession` |
| `lib/game-logic.ts` | Team balancing, `optimalPartition2`, `computePlayerDeltas` |
| `lib/player-names.ts` | `buildPlayerNames()` — disambiguates duplicate first names |
| `lib/export-data.ts` | CSV/XLSX export logic |
| `lib/db.ts` | Prisma client singleton |
| `lib/types.ts` | `PointsScope` and shared types |

### Email functions (`lib/email.ts`)
- `sendGameDayInvitation` — invite blast with quote
- `sendStatusUpdateEmail` — traffic-light status update
- `sendGameDayCancellation` — session cancelled
- `notifyOrganizersSessionRegistration` — player registered
- `notifyOrganizersCancellation` — player cancelled
- `sendRsvpConfirmation` — confirm to registering player
- `sendWelcomeEmail` — new account created (guest→permanent)
- `sendWaitlistConfirmation` — player placed on waitlist
- `sendWaitlistPromotion` — player promoted from waitlist
- `notifyOrganizersNewPlayer` — new player registered on site

All email functions guard on `SMTP_HOST` / `emailNotifications` — they silently skip in dev if SMTP not configured.

### Session actions (`sessions/[id]/actions.ts`) — organizer only
- Registration: `addRegistration`, `addRegistrationBulk`, `removeRegistration`, `cancelRegistrationAdmin`
- Waitlist: `addToWaitingList`, `removeFromWaitingList`, `setMaxPlayers` (inline editor in RegistrationPanel header)
- **Cap enforced in all organizer registration paths** — `addRegistration`, `addRegistrationBulk`, `addGuestAndRegister` all throw when full; organizer must call `setMaxPlayers` first
- Approval: `approveRegistration`, `rejectRegistration`
- Guests: `addGuestAndRegister`, `convertGuestToPlayer`
- Teams: `generateTeams`, `generateTeamsWithPins`, `addPlayerToTeam`, `movePlayer`, `createEmptyTeam`, `deleteTeam`
- Matches: `createMatchesFromTeams`, `startMatch`, `endMatch`, `recordGoal`, `undoLastGoal`, `deleteGoal`, `reopenMatch`, `startNextRound`, `addRematch`, `addNewMatch`
- Session lifecycle: `endSession`, `reopenSession`, `setMaxPlayers`
- Email: `getDefaultInvitation`, `sendInvitation`, `getSummaryEmailDefaults`, `sendSummaryEmail`, `getStatusUpdateDefaults`, `sendStatusUpdate`

### Schedule actions (`schedule/actions.ts`) — mixed
- `createSession(dateIso, maxPlayers?)` — default cap 12; throws if date falls within a `HallClosure`
- `registerSelf`, `maybeSelf`, `cancelSelf`, `toggleBeer` — player self-service
- `cancelSession`, `reopenCancelledSession`, `getCancelEmailDefaults`, `sendCancelEmail`

### AppConfig keys
| Key | Values | Effect |
|---|---|---|
| `emailFrom` | email string | From address for all outgoing mail |
| `requireApproval` | `"true"` / `"false"` | New registrations go to PENDING instead of REGISTERED |

### Env vars
`DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ENV`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

---

## Conventions

- **Server actions** use `"use server"` at top; organizer-only actions throw `"Unauthorized"` if role ≠ ORGANIZER.
- **Error handling**: every server action call in a client component must be in `try { ... } catch (e) { toast.error((e as Error).message) }` to catch *unexpected* errors. For *expected* validation failures, **return** a result object (`Promise<{ error: string } | { ok: true }>`) instead of throwing — Next.js redacts thrown Error messages in production (client only sees "An error occurred in the Server Components render…"), so a thrown German message never reaches the user. Client checks `if (res && "error" in res) toast.error(res.error)`. Also avoid `startTransition` around a mutation you try/catch — thrown errors inside it bubble to the error boundary (full-page error). `createSession` follows this pattern; other actions still throw (pending refactor).
- **Revalidation**: session detail actions call `revalidate(sessionId)` helper; schedule actions call `revalidatePath("/schedule")`.
- **Cap enforcement**: `maxPlayers ?? 12` everywhere — NULL means "default 12", not "unlimited".
- **Amber** styling = organizer-only UI element.
- **Guest players**: `passwordHash = null`, email ends in `@empor.guest`. Detected via `!player.passwordHash`.
- **Stats**: only recomputed on `endSession`. CSV import has separate recompute script `prisma/recompute-stats.ts`.
- **`session-client.tsx`** is large (~2600 lines). Key sections: `RegistrationPanel` (line ~218), `TeamsView` (line ~1640), `ActiveMatch` (line ~1944), main `SessionClient` (line ~2323).
- **Prisma enum additions** must NOT be in a transaction — always verify migration SQL before applying.
