import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

// Parse the right-side summary table: col 15=Name, 16=Gesamt, 17=Punkte, 18=kicks
function parseSummaryRows(text: string): { name: string; gesamt: number; kicks: number }[] {
  const rows: { name: string; gesamt: number; kicks: number }[] = []
  for (const line of text.split("\n")) {
    const cols = line.split(";")
    const rank = cols[0]?.trim()
    if (!rank || !/^\d+$/.test(rank)) continue
    const name = cols[15]?.trim()
    if (!name) continue
    const gesamt = parseInt(cols[16]?.trim() ?? "", 10)
    const kicks  = parseInt(cols[18]?.trim() ?? "", 10)
    if (isNaN(gesamt) || isNaN(kicks)) continue
    if (gesamt === 0 && kicks === 0) continue
    rows.push({ name, gesamt, kicks })
  }
  return rows
}

// Derive matchesPlayed from the left-side rows:
// tournament row = 2 matches, pts > 3 (W+W or W+D) = 2 matches, else 1
function parseMatchCounts(text: string): Map<string, number> {
  const matchesMap = new Map<string, number>()
  for (const line of text.split("\n")) {
    const cols = line.split(";")
    const rank = cols[0]?.trim()
    if (!rank || !/^\d+$/.test(rank)) continue
    const players = cols.slice(2, 9).map((c) => c.trim()).filter(Boolean)
    const pts = parseInt(cols[9]?.trim() ?? "", 10)
    const turnier = cols[10]?.trim().toLowerCase() === "ja"
    if (players.length === 0 || isNaN(pts)) continue
    const matchCount = turnier ? 2 : pts > 3 ? 2 : 1
    for (const name of players) {
      matchesMap.set(name, (matchesMap.get(name) ?? 0) + matchCount)
    }
  }
  return matchesMap
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const seasonYearParam = req.nextUrl.searchParams.get("season")
  const seasonYear = seasonYearParam ? parseInt(seasonYearParam, 10) : new Date().getFullYear()

  const text = await req.text()
  const summaryRows = parseSummaryRows(text)
  const matchCounts = parseMatchCounts(text)

  if (summaryRows.length === 0) {
    return NextResponse.json({ error: "No valid summary rows found in CSV." }, { status: 400 })
  }

  const season = await db.season.findUnique({ where: { year: seasonYear } })
  if (!season) {
    return NextResponse.json({ error: `Season ${seasonYear} not found.` }, { status: 400 })
  }

  const players = await db.player.findMany({
    where: { passwordHash: { not: null } },
    select: { id: true, firstName: true, lastName: true, nickname: true },
  })

  const byNickname = new Map<string, string>()
  const byFirstName = new Map<string, string>()
  const byFirstAndInitial = new Map<string, string>()
  for (const p of players) {
    if (p.nickname) byNickname.set(normalize(p.nickname), p.id)
    byFirstName.set(normalize(p.firstName), p.id)
    const initial = p.lastName?.[0] ?? ""
    byFirstAndInitial.set(normalize(p.firstName + initial), p.id)
  }

  const imported: string[] = []
  const skipped: string[] = []
  const unknownNames: string[] = []

  for (const row of summaryRows) {
    const key = normalize(row.name)
    const playerId = byNickname.get(key) ?? byFirstName.get(key) ?? byFirstAndInitial.get(key)
    if (!playerId) { unknownNames.push(row.name); continue }

    const playerName = players.find((p) => p.id === playerId)
    const label = playerName ? `${playerName.firstName} ${playerName.lastName}`.trim() : playerId

    const existing = await db.playerStats.findUnique({
      where: { playerId_seasonId: { playerId, seasonId: season.id } },
    })

    if (existing && existing.points > 0) {
      skipped.push(`${label} (already has points)`)
      continue
    }

    // matchesPlayed from left-side rows; fall back to kicks if name not found there
    const matches = matchCounts.get(row.name) ?? row.kicks
    const data = { points: row.gesamt, sessionsPlayed: row.kicks, matchesPlayed: matches }

    if (existing) {
      await db.playerStats.update({
        where: { playerId_seasonId: { playerId, seasonId: season.id } },
        data,
      })
    } else {
      await db.playerStats.create({
        data: { playerId, seasonId: season.id, ...data, goals: 0, assists: 0, score: 0 },
      })
    }

    const existingLt = await db.playerStatsLifetime.findUnique({ where: { playerId } })
    if (existingLt) {
      if (existingLt.points === 0) {
        await db.playerStatsLifetime.update({ where: { playerId }, data })
      }
    } else {
      await db.playerStatsLifetime.create({
        data: { playerId, ...data, goals: 0, assists: 0, score: 0 },
      })
    }

    imported.push(label)
  }

  return NextResponse.json({ ok: true, imported, skipped, unknownNames })
}
