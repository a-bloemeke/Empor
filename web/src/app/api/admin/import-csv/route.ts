import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"

// Parse the Fudo-style stats CSV:
// Columns (semicolon-separated): rank ; name ; goals ; assists ; score ; ... ; sessions
// Header rows have no numeric rank in col 0 — skip them.
// Match players by: nickname (exact) → firstName (exact) → firstName + lastName[0] initial
function parseCsvRows(text: string): { name: string; goals: number; assists: number; sessions: number }[] {
  const rows: { name: string; goals: number; assists: number; sessions: number }[] = []
  for (const line of text.split("\n")) {
    const cols = line.split(";")
    const rank = cols[0]?.trim()
    if (!rank || !/^\d+$/.test(rank)) continue
    const name = cols[1]?.trim()
    const goals = parseInt(cols[2]?.trim() ?? "", 10)
    const assists = parseInt(cols[3]?.trim() ?? "", 10)
    const sessions = parseInt(cols[8]?.trim() ?? "", 10)
    if (!name || isNaN(goals) || isNaN(assists)) continue
    rows.push({ name, goals, assists, sessions: isNaN(sessions) ? 0 : sessions })
  }
  return rows
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const seasonYearParam = req.nextUrl.searchParams.get("season")
  const seasonYear = seasonYearParam ? parseInt(seasonYearParam, 10) : new Date().getFullYear()

  const text = await req.text()
  const rows = parseCsvRows(text)
  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid rows found in CSV." }, { status: 400 })
  }

  const season = await db.season.findUnique({ where: { year: seasonYear } })
  if (!season) {
    return NextResponse.json({ error: `Season ${seasonYear} not found.` }, { status: 400 })
  }

  // Load all non-guest players for matching
  const players = await db.player.findMany({
    where: { passwordHash: { not: null } },
    select: { id: true, firstName: true, lastName: true, nickname: true },
  })

  // Build lookup maps
  const byNickname = new Map<string, string>()  // normalized nickname → id
  const byFirstName = new Map<string, string>()  // normalized firstName → id
  const byFirstAndInitial = new Map<string, string>()  // normalized firstName+lastInitial → id
  for (const p of players) {
    if (p.nickname) byNickname.set(normalize(p.nickname), p.id)
    byFirstName.set(normalize(p.firstName), p.id)
    const initial = p.lastName?.[0] ?? ""
    byFirstAndInitial.set(normalize(p.firstName + initial), p.id)
  }

  const imported: string[] = []
  const skipped: string[] = []

  for (const row of rows) {
    const key = normalize(row.name)
    const playerId =
      byNickname.get(key) ??
      byFirstName.get(key) ??
      byFirstAndInitial.get(key)

    if (!playerId) {
      skipped.push(row.name)
      continue
    }

    // Only import if this player has no season stats yet (idempotent re-import)
    const existing = await db.playerStats.findUnique({
      where: { playerId_seasonId: { playerId, seasonId: season.id } },
    })

    if (existing) {
      skipped.push(`${row.name} (already has season stats)`)
      continue
    }

    const score = row.goals + row.assists

    await db.playerStats.create({
      data: { playerId, seasonId: season.id, goals: row.goals, assists: row.assists, score, sessionsPlayed: row.sessions, matchesPlayed: 0, points: 0 },
    })

    // Upsert lifetime stats — only create if none exist yet
    const existingLt = await db.playerStatsLifetime.findUnique({ where: { playerId } })
    if (!existingLt) {
      await db.playerStatsLifetime.create({
        data: { playerId, goals: row.goals, assists: row.assists, score, sessionsPlayed: row.sessions, matchesPlayed: 0, points: 0 },
      })
    }

    imported.push(row.name)
  }

  return NextResponse.json({ ok: true, imported, skipped })
}
