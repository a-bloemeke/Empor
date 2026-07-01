import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

// Parse the right-side summary table from the Fudo CSV.
// Each data row has a rank (col 0), and the summary columns start at col 13:
//   col 13: Name, col 14: Gesamt (=points total), col 15: Punkte (outcome pts), col 16: kicks (sessions)
function parseSummaryRows(text: string): { name: string; gesamt: number; punkte: number; kicks: number }[] {
  const rows: { name: string; gesamt: number; punkte: number; kicks: number }[] = []
  for (const line of text.split("\n")) {
    const cols = line.split(";")
    const rank = cols[0]?.trim()
    if (!rank || !/^\d+$/.test(rank)) continue
    const name = cols[15]?.trim()
    if (!name) continue
    const gesamt = parseInt(cols[16]?.trim() ?? "", 10)
    const punkte = parseInt(cols[17]?.trim() ?? "", 10)
    const kicks  = parseInt(cols[18]?.trim() ?? "", 10)
    if (isNaN(gesamt) || isNaN(punkte) || isNaN(kicks)) continue
    if (gesamt === 0 && kicks === 0) continue  // skip placeholder rows
    rows.push({ name, gesamt, punkte, kicks })
  }
  return rows
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const seasonYearParam = req.nextUrl.searchParams.get("season")
  const seasonYear = seasonYearParam ? parseInt(seasonYearParam, 10) : new Date().getFullYear()

  const text = await req.text()
  const rows = parseSummaryRows(text)

  if (rows.length === 0) {
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

  for (const row of rows) {
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

    const data = { points: row.gesamt, sessionsPlayed: row.kicks, matchesPlayed: row.kicks }

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
