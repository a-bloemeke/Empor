import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

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
    if (goals === 0 && assists === 0) continue  // no activity — skip, don't create account
    rows.push({ name, goals, assists, sessions: isNaN(sessions) ? 0 : sessions })
  }
  return rows
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

// Names that are check/summary rows in the Fudo CSV, not real players
const CSV_SKIP_NAMES = new Set(["max", "369", "check", "super"])

function parseNameWithInitial(name: string): { firstName: string; initial: string } | null {
  const match = name.match(/^(.+?)([A-Z])$/)
  if (!match) return null
  const firstName = match[1]
  const initial = match[2]
  if (!firstName || !/^[A-Z]/.test(firstName)) return null
  return { firstName, initial }
}

async function findOrCreatePlayer(
  name: string,
  players: { id: string; firstName: string; lastName: string; nickname: string | null }[],
  byNickname: Map<string, string>,
  byFirstName: Map<string, string>,
  byFirstAndInitial: Map<string, string>,
): Promise<{ playerId: string; label: string; created: boolean }> {
  const key = normalize(name)
  const parsed = parseNameWithInitial(name)
  const existingId = byNickname.get(key) ?? byFirstName.get(key) ?? byFirstAndInitial.get(key)

  if (existingId) {
    const p = players.find((p) => p.id === existingId)!
    if (parsed && !p.nickname) {
      await db.player.update({ where: { id: existingId }, data: { nickname: name } })
      p.nickname = name
      byNickname.set(key, existingId)
    }
    return { playerId: existingId, label: `${p.firstName} ${p.lastName}`.trim(), created: false }
  }

  const email = `${normalize(name)}@empor.app`
  const passwordHash = await bcrypt.hash("Start1234", 12)
  const firstName = parsed ? parsed.firstName : name
  const lastName = parsed ? parsed.initial : name
  const nickname = parsed ? name : undefined
  const newPlayer = await db.player.create({
    data: { firstName, lastName, email, passwordHash, role: "PLAYER", ...(nickname ? { nickname } : {}) },
  })
  byFirstName.set(normalize(firstName), newPlayer.id)
  if (nickname) byNickname.set(normalize(nickname), newPlayer.id)
  return { playerId: newPlayer.id, label: name, created: true }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const seasonYearParam = req.nextUrl.searchParams.get("season")
  const seasonYear = seasonYearParam ? parseInt(seasonYearParam, 10) : new Date().getFullYear()
  const mode = req.nextUrl.searchParams.get("mode") === "overwrite" ? "overwrite" : "add"

  const text = await req.text()
  const rows = parseCsvRows(text)
  if (rows.length === 0) {
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

  const imported: string[] = []
  const skipped: string[] = []
  const created: string[] = []

  for (const row of rows) {
    if (CSV_SKIP_NAMES.has(normalize(row.name))) continue
    const { playerId, label, created: wasCreated } = await findOrCreatePlayer(
      row.name, players, byNickname, byFirstName, byFirstAndInitial
    )
    if (wasCreated) created.push(label)

    const existing = await db.playerStats.findUnique({
      where: { playerId_seasonId: { playerId, seasonId: season.id } },
    })

    const newGoals = mode === "add" ? (existing?.goals ?? 0) + row.goals : row.goals
    const newAssists = mode === "add" ? (existing?.assists ?? 0) + row.assists : row.assists
    const score = newGoals + newAssists

    if (existing) {
      // Never overwrite sessionsPlayed on update — that is owned by the points import
      await db.playerStats.update({
        where: { playerId_seasonId: { playerId, seasonId: season.id } },
        data: { goals: newGoals, assists: newAssists, score },
      })
    } else {
      await db.playerStats.create({
        data: { playerId, seasonId: season.id, goals: newGoals, assists: newAssists, score, sessionsPlayed: row.sessions, matchesPlayed: 0, points: 0 },
      })
    }

    const existingLt = await db.playerStatsLifetime.findUnique({ where: { playerId } })
    const ltGoals = mode === "add" ? (existingLt?.goals ?? 0) + row.goals : row.goals
    const ltAssists = mode === "add" ? (existingLt?.assists ?? 0) + row.assists : row.assists
    const ltScore = ltGoals + ltAssists
    if (!existingLt) {
      await db.playerStatsLifetime.create({
        data: { playerId, goals: ltGoals, assists: ltAssists, score: ltScore, sessionsPlayed: row.sessions, matchesPlayed: 0, points: 0 },
      })
    } else {
      // Never overwrite sessionsPlayed on update — that is owned by the points import
      await db.playerStatsLifetime.update({
        where: { playerId },
        data: { goals: ltGoals, assists: ltAssists, score: ltScore },
      })
    }

    imported.push(label)
  }

  return NextResponse.json({ ok: true, imported, skipped, created })
}
