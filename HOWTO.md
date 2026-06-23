# Empor — Operations & Data Import Howto

This document covers everything you need to run, manage, and import historical data into Empor.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Start / Stop / Restart](#2-start--stop--restart)
3. [Deploy to the internet](#3-deploy-to-the-internet)
4. [Import historical data — overview](#4-import-historical-data--overview)
5. [Workflow: import a new historical year](#5-workflow-import-a-new-historical-year)
6. [import_scores.py — reference](#6-import_scorespy--reference)
7. [Data export & import (in-app)](#7-data-export--import-in-app)
8. [Database direct access](#8-database-direct-access)
9. [Running tests](#9-running-tests)

---

## 1. Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| Node.js | 20 | [nodejs.org](https://nodejs.org) |
| Docker Desktop | any | [docker.com](https://www.docker.com/products/docker-desktop) |
| Python | 3.10+ | [python.org](https://python.org) |
| psycopg2-binary | — | `pip install psycopg2-binary` |

Clone the repo and install Node dependencies once:

```bash
git clone <repo-url>
cd Empor/web
npm install
```

---

## 2. Start / Stop / Restart

All scripts live at the **repo root** (`Empor/`). Run them from there.

### Start

```bash
./start.sh
```

What it does:
1. Starts the PostgreSQL container (`docker compose up -d`)
2. Waits until the database is ready
3. Runs any pending Prisma migrations (`npx prisma migrate deploy`)
4. Starts the Next.js dev server (`npm run dev`)

The app is available at **http://localhost:3000** once you see `✓ Ready`.

### Stop

```bash
./stop.sh
```

Kills the Next.js dev server process and stops the Docker container.  
Database data is **preserved** in the Docker volume — nothing is lost.

### Restart

```bash
./restart.sh
```

Calls `stop.sh` then `start.sh`. Use this after pulling new code or changing `.env` files.

---

## 3. Deploy to the internet

The simplest option is **Vercel + Neon** (free tier).

### Step-by-step

1. **Create a free Postgres database** at [neon.tech](https://neon.tech) → copy the connection string.

2. **Push the code to GitHub** (push the whole repo or just the `web/` folder as the root).

3. **Import to Vercel** at [vercel.com](https://vercel.com):
   - Set Root Directory → `web`
   - Add environment variables:
     ```
     DATABASE_URL=postgresql://...   ← from Neon
     AUTH_SECRET=<run: openssl rand -hex 32>
     ```
   - Click Deploy.

4. **Run migrations** once after the first deploy:
   ```bash
   # From your local machine with the production DATABASE_URL
   DATABASE_URL="postgresql://..." npx prisma migrate deploy
   ```

5. **Create the first organizer account** via the `/register` page, then promote them in the database:
   ```sql
   UPDATE "Player" SET role = 'ORGANIZER' WHERE email = 'your@email.com';
   ```

### Other options

| Platform | Notes |
|---|---|
| [Railway](https://railway.app) | App + DB in one place, good free tier |
| [Fly.io](https://fly.io) | More control, `fly launch` auto-detects Next.js |

---

## 4. Import historical data — overview

The script `import_scores.py` at the repo root reads legacy CSV score sheets (the "Fudo" Excel format) and writes goals, assists, kicks (game days played), and outcome points into the Empor database.

### Two CSV types

| File | Content | Flag |
|---|---|---|
| `Fudo_YYYY_Tables_Scores.csv` | Goals, assists, kicks per player | `--csv` |
| `Fudo_YYYY_Tables_Teams.csv` | Teams and match outcome points (Punkte) | `--teams` |

You can run them separately or together in one command.

### Points rule

- **Participation point**: +1 per game day played (from the kicks column in the scores CSV)
- **Outcome points**: added on top from the teams CSV (the "Punkte" column — 3=win, 1=draw, 0=loss, 6=tournament 1st, etc.)
- Final `points = sessionsPlayed + outcome_points`

---

## 5. Workflow: import a new historical year

Follow these steps in order.

### Step 1 — Create the season in the app

Log in as organizer → **Admin → Seasons** → add the year (e.g. 2025).

Or directly in the database:

```bash
docker exec web-db-1 psql -U empor -d empor -c \
  "INSERT INTO \"Season\" (id, year, status) VALUES (gen_random_uuid()::text, 2025, 'COMPLETED');"
```

### Step 2 — Identify unmapped players

Run a dry-run with the scores CSV to see who is skipped:

```bash
python3 import_scores.py --csv Fudo_2025_Tables_Scores.csv --year 2025 --dry-run
```

Look at the **Skipped** section. For each skipped player decide:

- **Already in DB under a different abbreviation** → add the alias to `YEAR_NAME_MAP[2025]` in `import_scores.py`
- **Needs a new account** → create it first (see Step 3)
- **Should be ignored** (one-off guest, test row) → leave them out

### Step 3 — Create missing player accounts

For each new player, either:

**Option A — via the app** (Admin → Players → Add player):
- Fill in email, first name, last name, password
- Note the email you used

**Option B — via psql**:
```bash
docker exec web-db-1 psql -U empor -d empor -c "
INSERT INTO \"Player\" (id, email, \"firstName\", \"lastName\", \"passwordHash\", role, \"createdAt\")
VALUES (
  encode(sha256(random()::text::bytea),'hex'),
  'firstname.lastname@empor.app',
  'Firstname', 'Lastname',
  '\$2b\$12\$EsYgQYiYVDiWJEQ/MMSlpuf0KEARCmH4QRSMBhHWkKbIiKgAoMGai',  -- default: empor2026
  'PLAYER', NOW()
);"
```

### Step 4 — Add name mappings

Open `import_scores.py` and add entries to `YEAR_NAME_MAP[2025]`:

```python
YEAR_NAME_MAP = {
    2026: {},
    2025: {
        "Andy":    "andy.mueller@empor.app",   # new player, just created
        "Ronny":   "ronny@empor.app",           # was active in 2025 only
        # Current-squad players who played in 2025 are already in DEFAULT_NAME_MAP
    },
    2014: {
        # ... see existing entries
    },
}
```

> **Tip**: players in `DEFAULT_NAME_MAP` (the current 2026 squad) are automatically available in every year — you only need to add names that differ or are year-specific.

### Step 5 — Preview

```bash
python3 import_scores.py \
  --csv   Fudo_2025_Tables_Scores.csv \
  --teams Fudo_2025_Tables_Teams.csv \
  --year  2025 \
  --dry-run
```

Check the output:
- All expected players appear in "will be imported/updated"
- Skipped list is only guests/test rows you want to ignore
- Goals, assists, kicks numbers look correct

### Step 6 — Import

```bash
# Import goals/assists first
python3 import_scores.py --csv Fudo_2025_Tables_Scores.csv --year 2025

# Then add outcome points from teams
python3 import_scores.py --teams Fudo_2025_Tables_Teams.csv --year 2025
```

Both commands ask for confirmation (`y/N`) before writing anything.

> **Note**: Running `--csv` wipes and re-inserts all stats for that season. Running `--teams` on top adds outcome points. Always run `--csv` before `--teams` for a fresh import.

### Step 7 — Verify in the app

Open the **Leaderboard**, switch to the imported season, and spot-check a few players' goals and points against the original CSV.

---

## 6. import_scores.py — reference

```
python3 import_scores.py [OPTIONS]

Options:
  --csv   PATH    Path to scores CSV (Fudo_YYYY_Tables_Scores.csv)
  --teams PATH    Path to teams CSV  (Fudo_YYYY_Tables_Teams.csv)
  --year  INT     Season year (required, must exist in DB)
  --dry-run       Preview without writing to the database
  --db    URL     Override DATABASE_URL (default: postgresql://empor:empor@localhost:5432/empor)
```

### Name mapping

Edit the two dicts at the top of `import_scores.py`:

```python
DEFAULT_NAME_MAP = {
    # Current squad — applies to all years
    "AndreasB":  "abloemeke@gmail.com",
    "Torsten":   "torsten.thomas@empor.app",
    # ... etc.
}

YEAR_NAME_MAP = {
    2026: {},       # no overrides needed
    2025: { ... },  # add year-specific aliases here
    2014: { ... },
}
```

Keys are **exactly** as they appear in the CSV (case-sensitive).  
Values are Empor **player email addresses**.

### Encoding

The script automatically tries UTF-8, then Windows-1252 (cp1252), then Latin-1. Most Excel-exported CSVs from German systems are cp1252.

---

## 7. Data export & import (in-app)

The organizer can export and restore data from **Admin → Data** in the app.

### Export

- Select scope: **All seasons** or a specific year
- Download as **JSON** or **Excel** (.xlsx)
- Passwords are never included
- Excel format: one sheet per table + a `Metadata` sheet

### Import

- Select scope: **All seasons** (replaces everything) or a specific year (replaces only that year's data)
- Upload a previously exported JSON or Excel file
- Auth accounts (email + password) are always preserved — nobody loses their login
- Fresh IDs are generated on import (no ID conflicts)

**Typical use case**: backup before a risky operation, or migrate the database to a new server.

```
Admin → Data → Export (All seasons, JSON) → store the file safely
... do risky thing ...
Admin → Data → Import → select "All seasons" → upload the backup
```

---

## 8. Database direct access

The PostgreSQL container is accessible locally during development.

```bash
# Open a psql shell
docker exec -it web-db-1 psql -U empor -d empor

# Run a one-liner
docker exec web-db-1 psql -U empor -d empor -c "SELECT year, status FROM \"Season\";"

# Promote a player to organizer
docker exec web-db-1 psql -U empor -d empor -c \
  "UPDATE \"Player\" SET role = 'ORGANIZER' WHERE email = 'user@example.com';"

# Wipe all game-day data (keeps players and seasons)
docker exec web-db-1 psql -U empor -d empor -c "
  BEGIN;
  DELETE FROM \"PlayerStatsLifetime\";
  DELETE FROM \"PlayerStats\";
  DELETE FROM \"Goal\";
  DELETE FROM \"Match\";
  DELETE FROM \"TeamPlayer\";
  DELETE FROM \"Team\";
  DELETE FROM \"SessionRegistration\";
  DELETE FROM \"Session\";
  COMMIT;"
```

### Connection details (local)

| Setting | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `empor` |
| User | `empor` |
| Password | `empor` |

---

## 9. Running tests

Unit tests cover the core business logic (standings, points, team names, name disambiguation, export filtering).

```bash
cd web

# Run all tests once
npm test

# Watch mode (re-runs on file change)
npm run test:watch

# With coverage report
npm run test:coverage
```

Tests live in `src/lib/__tests__/`. The test suite uses **Vitest** and runs without a database connection.

To add tests for new logic, create a `.test.ts` file next to the module in `src/lib/`.
