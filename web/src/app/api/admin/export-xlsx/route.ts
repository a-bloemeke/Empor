import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { buildExport, type ExportBundle } from "@/lib/export-data"
import { db } from "@/lib/db"
import * as XLSX from "xlsx"

function bundleToSheets(data: ExportBundle) {
  // Teams: flatten playerEmails array into separate rows
  const teamRows = data.teams.flatMap((t) =>
    t.playerEmails.length > 0
      ? t.playerEmails.map((email) => ({ sessionDate: t.sessionDate, teamName: t.name, playerEmail: email }))
      : [{ sessionDate: t.sessionDate, teamName: t.name, playerEmail: "" }]
  )

  return [
    { name: "Metadata",      rows: [{ version: data.version, scope: data.scope, seasonYear: data.seasonYear ?? "" }] },
    { name: "Players",       rows: data.players },
    { name: "Seasons",       rows: data.seasons },
    { name: "Sessions",      rows: data.sessions },
    { name: "Registrations", rows: data.registrations },
    { name: "Teams",         rows: teamRows },
    { name: "Matches",       rows: data.matches },
    { name: "Goals",         rows: data.goals },
    { name: "Fees",          rows: data.fees },
    { name: "SeasonStats",   rows: data.seasonStats },
    ...(data.lifetimeStats ? [{ name: "LifetimeStats", rows: data.lifetimeStats }] : []),
  ] as { name: string; rows: Record<string, unknown>[] }[]
}

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

  const wb = XLSX.utils.book_new()
  for (const { name, rows } of bundleToSheets(data)) {
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}])
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="empor-export${suffix}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
