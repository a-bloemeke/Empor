import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { buildExport } from "@/lib/export-data"
import { db } from "@/lib/db"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const seasonYear = req.nextUrl.searchParams.get("season")
  let seasonId: string | undefined
  if (seasonYear) {
    const s = await db.season.findUnique({ where: { year: Number(seasonYear) } })
    if (!s) return NextResponse.json({ error: "Season not found." }, { status: 404 })
    seasonId = s.id
  }

  const data = await buildExport(seasonId)
  const suffix = seasonYear ? `-season-${seasonYear}` : "-all"

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="empor-export${suffix}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}
