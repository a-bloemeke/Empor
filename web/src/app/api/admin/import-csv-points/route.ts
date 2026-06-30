import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"

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

  // Aggregate points, matchesPlayed, and sessionsPlayed (unique matchdays) per player name
  const pointsMap = new Map<string, number>()
  const matchesMap = new Map<string, number>()
  const sessionDays = new Map<string, Set<string>>()  // name → set of matchday values

  for (const line of text.split("\n")) {
    const cols = line.split(";")
    if (!cols[0]?.trim() || !/^\d+$/.test(cols[0].trim())) continue
    const matchday = cols[1]?.trim() ?? ""
    const players = cols.slice(2, 9).map((c) => c.trim()).filter(Boolean)
    const pts = parseInt(cols[9]?.trim() ?? "", 10)
    if (players.length === 0 || isNaN(pts)) continue
    for (const name of players) {
      pointsMap.set(name, (pointsMap.get(name) ?? 0) + pts)
      matchesMap.set(name, (matchesMap.get(name) ?? 0) + 1)
      if (!sessionDays.has(name)) sessionDays.set(name, new Set())
      sessionDays.get(name)!.add(matchday)
    }
  }

  if (pointsMap.size === 0) {
    return NextResponse.json({ error: "No valid rows found in CSV." }, { status: 400 })
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

  // Resolve CSV names → player IDs
  const idPointsMap = new Map<string, number>()
  const idMatchesMap = new Map<string, number>()
  const idSessionsMap = new Map<string, number>()
  const unknownNames = new Set<string>()

  for (const [name, pts] of pointsMap) {
    const key = normalize(name)
    const playerId = byNickname.get(key) ?? byFirstName.get(key) ?? byFirstAndInitial.get(key)
    if (!playerId) { unknownNames.add(name); continue }
    idPointsMap.set(playerId, (idPointsMap.get(playerId) ?? 0) + pts)
    idMatchesMap.set(playerId, (idMatchesMap.get(playerId) ?? 0) + (matchesMap.get(name) ?? 0))
    idSessionsMap.set(playerId, (idSessionsMap.get(playerId) ?? 0) + (sessionDays.get(name)?.size ?? 0))
  }

  const imported: string[] = []
  const skipped: string[] = []

  for (const [playerId, pts] of idPointsMap) {
    const matches = idMatchesMap.get(playerId) ?? 0
    const sessions = idSessionsMap.get(playerId) ?? 0
    const playerName = players.find((p) => p.id === playerId)
    const label = playerName ? `${playerName.firstName} ${playerName.lastName}`.trim() : playerId

    const existing = await db.playerStats.findUnique({
      where: { playerId_seasonId: { playerId, seasonId: season.id } },
    })

    if (existing && existing.points > 0) {
      skipped.push(`${label} (already has points)`)
      continue
    }

    if (existing) {
      await db.playerStats.update({
        where: { playerId_seasonId: { playerId, seasonId: season.id } },
        data: { points: pts, matchesPlayed: matches, sessionsPlayed: sessions },
      })
    } else {
      await db.playerStats.create({
        data: { playerId, seasonId: season.id, points: pts, matchesPlayed: matches, sessionsPlayed: sessions, goals: 0, assists: 0, score: 0 },
      })
    }

    const existingLt = await db.playerStatsLifetime.findUnique({ where: { playerId } })
    if (existingLt) {
      if (existingLt.points === 0) {
        await db.playerStatsLifetime.update({
          where: { playerId },
          data: { points: pts, matchesPlayed: matches, sessionsPlayed: sessions },
        })
      }
    } else {
      await db.playerStatsLifetime.create({
        data: { playerId, points: pts, matchesPlayed: matches, sessionsPlayed: sessions, goals: 0, assists: 0, score: 0 },
      })
    }

    imported.push(label)
  }

  return NextResponse.json({ ok: true, imported, skipped, unknownNames: [...unknownNames] })
}
