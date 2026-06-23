#!/usr/bin/env python3
"""
import_scores.py — Import historical goal/assist/team-points stats into Empor.

Supports two CSV formats from the "Fudo" Excel sheets:
  --csv   PATH   Scores CSV  (Fudo_YYYY_Tables_Scores.csv)  — goals, assists, kicks
  --teams PATH   Teams  CSV  (Fudo_YYYY_Tables_Teams.csv)   — outcome points per player

Usage:
  python3 import_scores.py --csv   Fudo_2026_Tables_Scores.csv --year 2026
  python3 import_scores.py --teams Fudo_2026_Tables_Teams.csv  --year 2026
  python3 import_scores.py --csv scores.csv --teams teams.csv  --year 2026
  python3 import_scores.py --csv scores.csv --year 2014 --dry-run

  # Custom DB
  python3 import_scores.py --csv scores.csv --year 2026 --db postgresql://user:pass@host/db

Requirements:
  pip install psycopg2-binary

NAME_MAP: maps CSV player abbreviations → Empor email addresses.
Add a YEAR_NAME_MAP entry for seasons where player names differ from the default.
"""

import argparse
import os
import re
import sys

# ── Database URL ─────────────────────────────────────────────────────────────

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://empor:empor@localhost:5432/empor"
)

# ── Name maps ─────────────────────────────────────────────────────────────────
#
# DEFAULT_NAME_MAP: applies to all years unless overridden by YEAR_NAME_MAP.
# YEAR_NAME_MAP:   year-specific overrides / additions.
#
# Keys are exactly as they appear in the CSV (case-sensitive).
# Values are Empor player email addresses.

DEFAULT_NAME_MAP = {
    # 2026 squad (also active in later years)
    "Torsten":   "torsten.thomas@empor.app",
    "Patrick":   "patrick.hanel@empor.app",
    "AndreasB":  "abloemeke@gmail.com",
    "Volker":    "volker.winkelmann@empor.app",
    "RobertC":   "robert.carus@empor.app",
    "Mika":      "mika.gornig@empor.app",
    "FrankB":    "frank.buechner@empor.app",
    "Balle":     "steffen.baltz@empor.app",
    "Matze":     "mathias.schuetz@empor.app",
    "Berni":     "berhard.waschke@empor.app",
    "FrankH":    "frank.heidenreich@empor.app",
    "Lutz":      "lutz.liebherr@empor.app",
    "Alex":      "alexander.rabus@empor.app",
    "RobertS":   "robert.simon@empor.app",
    "Heiko":     "heiko.simon@empor.app",
    "KaiP":      "kai.paulsen@empor.app",
    "Tim":       "tim.friedrich@empor.app",
    "Sebastian": "sebastian.jentsch@empor.app",
    "MatthiasB": "matthias.bachmann@empor.app",
    "Harald":    "harald.ludwig@empor.app",
    "Willi":     "william@empor.app",
    "Martin":    "martin.berg@empor.app",
    "Jrn":       "joern@empor.app",
    "Jšrn":      "joern@empor.app",   # Windows-1252 mojibake for Jörn
    # Add more current-squad aliases here as needed
}

# Year-specific additions/overrides.
# Use this for seasons where players used different names or abbreviations,
# or for players who only appeared in a specific year.
#
# Example for a hypothetical 2025 season where "Andy" = Andreas Blömeke:
#   YEAR_NAME_MAP[2025] = {"Andy": "abloemeke@gmail.com", ...}
#
# For players entirely new to a year (not in DEFAULT_NAME_MAP), add them here.
YEAR_NAME_MAP: dict[int, dict[str, str]] = {
    # 2026 — same as default, no overrides needed
    2026: {},

    # 2014 — completely different squad; map their abbreviations.
    # IMPORTANT: create these player accounts in Empor first, then add their emails here.
    # Until you add the emails, those players will be skipped with a warning.
    2014: {
        # Example entries — uncomment and fill in real emails after creating accounts:
        # "Galopper":   "galopper@empor.app",
        # "Ulf":        "ulf@empor.app",
        # "StefanT":    "stefan.t@empor.app",
        # "StefanK":    "stefan.k@empor.app",
        # "AndreasT":   "andreas.t@empor.app",
        # "AndreasL":   "andreas.l@empor.app",
        # "AndreasS":   "andreas.s@empor.app",
        # "AndreasP":   "andreas.p@empor.app",
        # "Kevin":      "kevin@empor.app",
        # "Axel":       "axel@empor.app",
        # "Ronny":      "ronny@empor.app",
        # "Thomas":     "thomas@empor.app",
        # "TexMex":     "texmex@empor.app",
        # "Daniel":     "daniel@empor.app",
        # "Dirk":       "dirk@empor.app",
        # "KumpelvAxel":"kumpelv.axel@empor.app",
        # "Steve":      "steve@empor.app",
        # 2014 players who are also in current squad:
        "AndreasB":  "abloemeke@gmail.com",
        "Volker":    "volker.winkelmann@empor.app",
        "Lutz":      "lutz.liebherr@empor.app",
        "Balle":     "steffen.baltz@empor.app",
        "Berni":     "berhard.waschke@empor.app",
        "Matze":     "mathias.schuetz@empor.app",
    },
}


def get_name_map(year: int) -> dict[str, str]:
    """Merge DEFAULT_NAME_MAP with year-specific overrides."""
    merged = dict(DEFAULT_NAME_MAP)
    merged.update(YEAR_NAME_MAP.get(year, {}))
    return merged


# ── Encoding-safe file reader ─────────────────────────────────────────────────

def read_lines(path: str) -> list[str]:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            with open(path, encoding=enc) as f:
                return [line.rstrip("\n") for line in f]
        except UnicodeDecodeError:
            continue
    raise ValueError(f"Could not decode {path} with utf-8, cp1252 or latin-1")


# ── CSV parsers ───────────────────────────────────────────────────────────────

def parse_scores_csv(path: str) -> dict[str, dict]:
    """
    Parse the scores CSV (Fudo_YYYY_Tables_Scores.csv).
    Returns dict: csv_name → {goals, assists, kicks}

    Layout:
      Summary section (left side):  col0=rank(int), col1=name, col2=goals, col3=assists, col8=kicks
      Detail  section (right side): col9=matchday(int), col10=name, col11=goals, col12=assists
    """
    lines = read_lines(path)
    summary: dict[str, dict] = {}
    detail:  dict[str, dict] = {}
    cur_md = None

    for line in lines:
        cols = line.split(";")
        while len(cols) < 14:
            cols.append("")

        # Summary row: col0 is a non-zero integer rank
        col0 = cols[0].strip()
        if re.match(r"^\d+$", col0) and int(col0) > 0:
            name = cols[1].strip()
            if name and name not in ("Kicker", "Summen", "sum"):
                g = _int(cols[2]); a = _int(cols[3]); k = _int(cols[8])
                if name not in summary:
                    summary[name] = {"goals": g, "assists": a, "kicks": k}

        # Detail: col9 may hold a matchday number
        md_str = cols[9].strip()
        if re.match(r"^\d+$", md_str) and md_str != "0":
            cur_md = int(md_str)

        det_name = cols[10].strip()
        if det_name and det_name not in ("player", ""):
            g = _int(cols[11]); a = _int(cols[12])
            if det_name not in detail:
                detail[det_name] = {"goals": 0, "assists": 0, "kicks": set()}
            detail[det_name]["goals"]   += g
            detail[det_name]["assists"] += a
            if cur_md:
                detail[det_name]["kicks"].add(cur_md)

    # Merge: summary is authoritative; detail fills in players missing from summary
    result: dict[str, dict] = dict(summary)
    for name, d in detail.items():
        if name not in result and name not in ("Gast", "player"):
            result[name] = {
                "goals":   d["goals"],
                "assists": d["assists"],
                "kicks":   len(d["kicks"]),
            }
    return result


def parse_teams_csv(path: str) -> dict[str, int]:
    """
    Parse the teams CSV (Fudo_YYYY_Tables_Teams.csv).
    Returns dict: csv_name → total outcome points earned.
    Columns: 0=Team-Nr, 1=Matchday, 2-8=players, 9=Punkte
    """
    lines = read_lines(path)
    outcome: dict[str, int] = {}

    for line in lines[1:]:   # skip header
        cols = line.split(";")
        while len(cols) < 10:
            cols.append("")
        try:
            int(cols[0].strip())
        except ValueError:
            continue
        if not cols[1].strip().isdigit():
            continue
        try:
            pts = int(float(cols[9].strip()))
        except ValueError:
            continue
        players = [cols[i].strip() for i in range(2, 9)
                   if i < len(cols) and cols[i].strip() not in ("Gast", "")]
        for p in players:
            outcome[p] = outcome.get(p, 0) + pts

    return outcome


# ── Database helpers ──────────────────────────────────────────────────────────

def _int(s: str) -> int:
    try:
        return int(float(s.strip().replace(",", ".")))
    except (ValueError, TypeError):
        return 0


def get_connection():
    try:
        import psycopg2
    except ImportError:
        print("ERROR: psycopg2-binary not installed.  Run:  pip install psycopg2-binary")
        sys.exit(1)
    return psycopg2.connect(DB_URL)


def fetch_email_to_id(cur) -> dict[str, str]:
    cur.execute('SELECT email, id FROM "Player"')
    return {row[0]: row[1] for row in cur.fetchall()}


def fetch_season_id(cur, year: int) -> str:
    cur.execute('SELECT id FROM "Season" WHERE year = %s', (year,))
    row = cur.fetchone()
    if not row:
        print(f"ERROR: Season {year} not found in the database.")
        sys.exit(1)
    return row[0]


def _resolve(csv_name: str, name_map: dict, email_to_id: dict) -> tuple[str | None, str | None]:
    """Return (email, player_id) or (None, None) with a reason string."""
    email = name_map.get(csv_name)
    if not email:
        return None, None
    pid = email_to_id.get(email)
    if not pid:
        return email, None
    return email, pid


# ── Import: scores (goals / assists / kicks) ──────────────────────────────────

def import_scores(csv_path: str, year: int, dry_run: bool = False) -> None:
    print(f"\n{'='*60}")
    print(f"Scores CSV: {csv_path}  (year={year})")
    stats = parse_scores_csv(csv_path)

    print(f"\nFound {len(stats)} players:")
    for name, s in sorted(stats.items(), key=lambda x: -x[1]["goals"]):
        if s["goals"] > 0 or s["assists"] > 0:
            print(f"  {name:18} goals={s['goals']:4}  assists={s['assists']:4}  kicks={s['kicks']:3}")

    conn = get_connection()
    cur  = conn.cursor()
    email_to_id = fetch_email_to_id(cur)
    name_map    = get_name_map(year)
    season_id   = fetch_season_id(cur, year)

    mapped, skipped = [], []
    for csv_name, s in stats.items():
        email, pid = _resolve(csv_name, name_map, email_to_id)
        if not email:
            skipped.append((csv_name, "not in NAME_MAP"))
            continue
        if not pid:
            skipped.append((csv_name, f"email {email!r} not in database"))
            continue
        g = s["goals"]; a = s["assists"]; k = s["kicks"]
        mapped.append((csv_name, email, pid, k, g, a, g + a, k))   # points = kicks initially

    _print_summary(mapped, skipped, "import")

    if dry_run:
        print("\n-- DRY RUN: no changes written --")
        for csv_name, email, pid, k, g, a, sc, pts in mapped:
            print(f"  {csv_name:18} sessions={k:3}  goals={g:4}  assists={a:4}  score={sc:4}  base_pts={pts:3}")
        cur.close(); conn.close(); return

    if not _confirm(f"Import {len(mapped)} players into season {year}?"):
        cur.close(); conn.close(); return

    cur.execute('DELETE FROM "PlayerStats" WHERE "seasonId" = %s', (season_id,))
    cur.execute('DELETE FROM "PlayerStatsLifetime"')

    for _, _, pid, k, g, a, sc, pts in mapped:
        cur.execute("""
            INSERT INTO "PlayerStats"
              (id, "playerId", "seasonId", "sessionsPlayed", "matchesPlayed",
               goals, assists, score, points)
            VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (pid, season_id, k, k, g, a, sc, pts))
        cur.execute("""
            INSERT INTO "PlayerStatsLifetime"
              ("playerId", "sessionsPlayed", "matchesPlayed", goals, assists, score, points)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (pid, k, k, g, a, sc, pts))

    conn.commit()
    print(f"\nDone. Imported {len(mapped)} players into season {year}.")
    cur.close(); conn.close()


# ── Import: teams (outcome points) ───────────────────────────────────────────

def import_teams(csv_path: str, year: int, dry_run: bool = False) -> None:
    print(f"\n{'='*60}")
    print(f"Teams CSV: {csv_path}  (year={year})")
    outcome = parse_teams_csv(csv_path)

    print(f"\nOutcome points per player:")
    for name, pts in sorted(outcome.items(), key=lambda x: -x[1]):
        if pts > 0:
            print(f"  {name:18} +{pts:4} outcome pts")

    conn = get_connection()
    cur  = conn.cursor()
    email_to_id = fetch_email_to_id(cur)
    name_map    = get_name_map(year)
    fetch_season_id(cur, year)   # validate season exists

    mapped, skipped = [], []
    for csv_name, pts in outcome.items():
        email, pid = _resolve(csv_name, name_map, email_to_id)
        if not email:
            skipped.append((csv_name, "not in NAME_MAP"))
            continue
        if not pid:
            skipped.append((csv_name, f"email {email!r} not in database"))
            continue
        mapped.append((csv_name, email, pid, pts))

    _print_summary(mapped, skipped, "update")

    if dry_run:
        print("\n-- DRY RUN: no changes written --")
        for csv_name, email, _, pts in mapped:
            print(f"  {csv_name:18} ({email}) += {pts} outcome pts")
        cur.close(); conn.close(); return

    if not _confirm(f"Add outcome points for {len(mapped)} players in season {year}?"):
        cur.close(); conn.close(); return

    for _, _, pid, pts in mapped:
        cur.execute(
            'UPDATE "PlayerStats" SET points = "sessionsPlayed" + %s WHERE "playerId" = %s',
            (pts, pid)
        )
        cur.execute(
            'UPDATE "PlayerStatsLifetime" SET points = "sessionsPlayed" + %s WHERE "playerId" = %s',
            (pts, pid)
        )

    conn.commit()
    print(f"\nDone. Updated {len(mapped)} players.")
    cur.close(); conn.close()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _print_summary(mapped, skipped, verb):
    print(f"\n{len(mapped)} players will be {verb}d, {len(skipped)} skipped.")
    if skipped:
        print("Skipped:")
        for name, reason in skipped:
            print(f"  {name}: {reason}")


def _confirm(prompt: str) -> bool:
    answer = input(f"\n{prompt} [y/N] ").strip().lower()
    if answer != "y":
        print("Aborted.")
        return False
    return True


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Import historical score stats into Empor from CSV.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 import_scores.py --csv   Fudo_2026_Tables_Scores.csv --year 2026
  python3 import_scores.py --teams Fudo_2026_Tables_Teams.csv  --year 2026
  python3 import_scores.py --csv scores.csv --teams teams.csv  --year 2026 --dry-run
  python3 import_scores.py --csv scores.csv --year 2014 --dry-run
        """
    )
    parser.add_argument("--csv",     default=None, help="Path to the scores CSV (goals/assists/kicks)")
    parser.add_argument("--teams",   default=None, help="Path to the teams CSV (match outcome points)")
    parser.add_argument("--year",    type=int, required=True, help="Season year (must exist in DB)")
    parser.add_argument("--dry-run", action="store_true",     help="Preview without writing to DB")
    parser.add_argument("--db",      default=None,            help="Override DATABASE_URL connection string")
    args = parser.parse_args()

    if not args.csv and not args.teams:
        parser.error("Provide at least --csv or --teams (or both).")

    if args.db:
        global DB_URL
        DB_URL = args.db

    if args.csv:
        import_scores(args.csv, args.year, dry_run=args.dry_run)

    if args.teams:
        import_teams(args.teams, args.year, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
