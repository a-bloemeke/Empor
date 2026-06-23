# Empor — Football Game Day & Tournament Manager

## Overview

Empor is a web app for small groups of players who meet weekly for informal football. Each game day, players are split into 2–3 teams that compete in short matches. The app tracks goals, assists, and match outcomes across all game days, organised into annual seasons (January–December), and builds both per-season and lifetime leaderboards per player.

**Stack:** Next.js 16 (App Router, Server Actions), Prisma 7 + PostgreSQL, Auth.js v5, Base UI, Tailwind CSS v4, shadcn components.

---

## Core Concepts

| Term | Definition |
|---|---|
| **Season** | A calendar year (Jan 1 – Dec 31). All game days belong to a season. |
| **Player** | A registered user with a profile and cumulative statistics. |
| **Guest** | A temporary player created by an organizer (no login, no email/password). |
| **Game Day** | A single weekly meeting. Contains one or more matches. |
| **Team** | A temporary group of players formed for one game day. Named Team A, B, C… |
| **Round** | One full cycle of matches in tournament mode (all 3-team pairs play once). |
| **Match** | A game between two teams. Ends at 10 goals or on time. |
| **Score** | Per-player stat: goals + assists. |
| **Points** | Per-player stat: 1 participation point per game day + match/tournament outcome points. |

---

## User Roles

### Organizer
- Creates game days, forms teams, starts/ends matches, records goals/assists.
- Can register or remove any player's attendance at any time.
- Manages membership fee records, seasons, players, and guests.
- Can edit any player's profile and change passwords.
- Can re-open a completed match or game day (stats are reversed on re-open).

### Player
- Has an account, can register/cancel for upcoming game days.
- Can record goal/assist events during a match (self-service).
- Can edit their own profile and change their own password.

---

## Implemented Features

### 1. Player Profile
| Field | Notes |
|---|---|
| First name | Required |
| Last name | Required |
| Nickname | Optional (e.g. "Balle", "Berni") |
| Date of birth | Optional |
| Address | Street, city, postal code (optional) |
| Email | Login identifier (organizer-editable) |
| Role | PLAYER or ORGANIZER (organizer-editable) |

- Players edit their own profile; organizers edit any profile including email, role, and password.
- Separate "Change Password" dialog.

### 2. Guest Accounts
- Organizers create named guest players (e.g. "Gast – Thomas") with no login credentials.
- Guests appear in all player lists and can be assigned to teams, have goals/assists recorded.
- Guest stats tracked per season and lifetime like regular players.
- Guests created inline on game day registration panel or via Admin → Players.
- Guests identified by `@empor.guest` email addresses.

### 3. Schedule & Registration
- Upcoming game days visible to all in the schedule view.
- Players register themselves; cancellation blocked within 1 hour of start time.
- Organizers register/remove players at any time; bulk registration via checkbox list.
- Game days can be cancelled by the organizer.

### 4. Game Day Management
- Statuses: `SCHEDULED → IN_PROGRESS → COMPLETED` (also `CANCELLED`).
- Organizer can re-open a completed game day (stats reversed automatically).
- Game day page has a full-width dark-green header banner indicating live status, tournament mode badge, and match count.

### 5. Team Formation
**Random** — players shuffled and distributed evenly.

**Balanced** — snake-draft by each player's lifetime points-per-session average.

- Initial teams named Team A, B, C. Sequential new matches use C/D, E/F, etc.
- Teams can be regenerated ("Shuffle randomly" or "Balance by rating") before the session starts.
- Teams with no matches played yet can be deleted individually.
- Each team card shows player list with season rank, season points, and a total points sum.

### 6. Match Modes

#### 2-Team Mode
- Single match; organizer can start a Rematch (same teams), New Match (random), or New Match (balanced) after each match.
- Match result cards: dark-green gradient score bar, goal log split by team column with running score.

#### 3-Team Tournament Mode
- Up to 5 rounds; each round is a full round-robin (3 matches).
- After each round: standings shown; organizer chooses Play Round N+1, Switch to normal play, or End Game Day.
- **Switch to normal play** — available any time no match is running, prompts for random or balanced teams.
- Results grouped by round badge on completed game day page.

#### Mixed Mode (tournament → normal)
- When a game day starts as a tournament and switches to normal play, on closing the organizer is asked which matches count for points:
  - **All matches** — tournament placement + normal win/draw points
  - **Tournament only** — placement points only
  - **Normal matches only** — win/draw points only
  - **Goals & assists only** — no match points (only participation point)

### 7. Points Scoring
| Source | Points |
|---|---|
| Participating in a game day | **+1** (always, regardless of scope) |
| Winning a 2-team match | +3 |
| Drawing a 2-team match | +1 |
| Tournament 1st place | +6 |
| Tournament 2nd place | +3 |
| Tournament 3rd place | +0 |

Tied tournament placements: 1st+2nd tied → both 6; 2nd+3rd tied → both 3; all three tied → all 3.

### 8. Live Scoreboard (`/sessions/[id]/scoreboard`)
Full-screen touch/click scoreboard:
- Tap home or away side to open goal-entry drawer (scorer + optional assist).
- **Timer**: select match duration (1–10 min), Start/Pause/Resume/Reset.
  - At 60 seconds remaining: audio file `last-minute.mp3` plays (arena announcer).
  - During the last 60s: board transitions yellow → red per second.
  - At 10 seconds remaining: audio file `last-10-seconds.mp3` plays, sped up to fit exactly 10s.
  - At 0: truck horn `truck-horn.mp3` plays for 5s, board pulses red, then turns dark green (`#006400`).
- Player lists show disambiguated first names (surname initials added only when needed), left-aligned, sorted by season points with global rank and team total.
- Auto-polls every 5 seconds; scoreboard tab reused (no duplicate tabs).

### 9. Statistics & Leaderboard
- **Per season** and **lifetime** stats: sessions played, matches played, goals, assists, score (G+A), points, pts/game day.
- Stats computed on game day close; reversed on re-open.
- Leaderboard has two tables: **Points** (fixed sort) and **Scorers** (sortable by Goals/Assists/Score).
- Points scope selectable for mixed game days (see §6).

### 10. Membership Fee Management
- One fee per player per year; organizer marks paid/not paid with date.

### 11. Season Management
- Organizer opens/closes seasons. Closing freezes stats.
- Leaderboard has a season selector; past seasons fully accessible.

### 12. Data Export / Import
- **Export**: JSON or Excel, scoped to a single season or all seasons. No passwords included.
- **Import**: JSON or Excel, season-scoped; fresh IDs generated; auth accounts preserved.
- Excel: one sheet per table, `Metadata` sheet stores scope/version.
- **Historical CSV import**: `import_scores.py` at repo root imports goals/assists/kicks from legacy CSV score sheets. Maps player abbreviations to emails via `NAME_MAP` dict. Run with `--dry-run` to preview. See script header for usage.

### 13. Admin Pages (organizer only)
- **Players** — create players (email+password), create guests (name only), delete, role management.
- **Membership Fees** — payment tracking per year.
- **Seasons** — open/close seasons.
- **Data** — export/import with format and scope selection.

### 14. Design
- Green football theme; dark-green nav and table headers; green primary color.
- Sports-media style tables: dark gradient header, alternating rows.
- Landing page: hero with SVG pitch markings, feature cards, how-it-works timeline.
- Match result cards: dark-green gradient score bar, running score in goal log.

---

## Data Model (Implemented)

```
Player
  id, email (unique), passwordHash (nullable — null for guests),
  firstName, lastName, nickname?, dateOfBirth?, address fields, role, createdAt

Season
  id, year (unique), status (ACTIVE|COMPLETED)

MembershipFee
  id, playerId, year, status (NOT_PAID|PAID), paidAt?, recordedById

Session
  id, seasonId, date, status (SCHEDULED|IN_PROGRESS|COMPLETED|CANCELLED), organizerId

SessionRegistration
  id, sessionId, playerId, status (REGISTERED|CANCELLED),
  registeredAt, cancelledAt?, registeredById

Team
  id, sessionId, name

TeamPlayer
  teamId, playerId

Match
  id, sessionId, roundNumber (null=normal, 1-5=tournament),
  homeTeamId, awayTeamId, homeScore, awayScore,
  status (PENDING|IN_PROGRESS|COMPLETED),
  startedAt?, endedAt?, endCondition (GOALS|TIME|MANUAL)?

Goal
  id, matchId, scoredByPlayerId, assistedByPlayerId?, teamId, scoredAt

PlayerStats
  playerId, seasonId, sessionsPlayed, matchesPlayed, goals, assists, score, points

PlayerStatsLifetime
  playerId, sessionsPlayed, matchesPlayed, goals, assists, score, points
```

---

## Historical Data Import

The `import_scores.py` script at the repo root imports goals/assists from legacy CSV score sheets (the "Fudo" Excel format exported as semicolon-separated CSV).

```bash
# Preview without writing
python3 import_scores.py --csv Fudo_2026_Tables_Scores.csv --year 2026 --dry-run

# Import
python3 import_scores.py --csv Fudo_2026_Tables_Scores.csv --year 2026

# Different database
python3 import_scores.py --csv scores.csv --year 2025 --db postgresql://user:pass@host/db
```

To add new player name mappings, edit the `NAME_MAP` dict in `import_scores.py`.

---

## Out of Scope

- Real-time SSE (scoreboard polls every 5s instead)
- Avatar upload
- Social login
- Push notifications
- Substitutions, cards, match timer in the main app
- Multi-group / bracket tournaments beyond round-robin
- Payment / subscription features
