import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { computeAndSaveStats } from "@/lib/stats"

// Replays computeAndSaveStats for every CLOSED session in the given season.
// Use after a CSV import to add the live-recorded session data on top.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { seasonYear } = await req.json() as { seasonYear: number }
  const season = await db.season.findUnique({ where: { year: seasonYear } })
  if (!season) return NextResponse.json({ error: `Season ${seasonYear} not found.` }, { status: 400 })

  const sessions = await db.session.findMany({
    where: { seasonId: season.id, status: "COMPLETED" },
    select: { id: true },
  })

  for (const s of sessions) {
    await computeAndSaveStats(s.id, "all")
  }

  return NextResponse.json({ ok: true, sessions: sessions.length })
}
