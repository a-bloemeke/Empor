import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { type, seasonYear } = await req.json() as { type: "points" | "scores" | "all"; seasonYear?: number }

  if (seasonYear) {
    const season = await db.season.findUnique({ where: { year: seasonYear } })
    if (!season) return NextResponse.json({ error: `Season ${seasonYear} not found.` }, { status: 400 })

    if (type === "points") {
      await db.playerStats.updateMany({
        where: { seasonId: season.id },
        data: { points: 0, matchesPlayed: 0, sessionsPlayed: 0 },
      })
      await db.playerStatsLifetime.updateMany({ data: { points: 0, matchesPlayed: 0, sessionsPlayed: 0 } })
    } else if (type === "scores") {
      await db.playerStats.updateMany({
        where: { seasonId: season.id },
        data: { goals: 0, assists: 0, score: 0 },
      })
      await db.playerStatsLifetime.updateMany({ data: { goals: 0, assists: 0, score: 0 } })
    } else {
      await db.playerStats.deleteMany({ where: { seasonId: season.id } })
      await db.playerStatsLifetime.deleteMany()
    }
  } else {
    if (type === "points") {
      await db.playerStats.updateMany({ data: { points: 0, matchesPlayed: 0, sessionsPlayed: 0 } })
      await db.playerStatsLifetime.updateMany({ data: { points: 0, matchesPlayed: 0, sessionsPlayed: 0 } })
    } else if (type === "scores") {
      await db.playerStats.updateMany({ data: { goals: 0, assists: 0, score: 0 } })
      await db.playerStatsLifetime.updateMany({ data: { goals: 0, assists: 0, score: 0 } })
    } else {
      await db.playerStats.deleteMany()
      await db.playerStatsLifetime.deleteMany()
    }
  }

  return NextResponse.json({ ok: true })
}
