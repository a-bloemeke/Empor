import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { importBundle, filterBundleToSeason, type ExportBundle, type ExportTeam } from "@/lib/export-data"
import * as XLSX from "xlsx"

function sheet<T>(wb: XLSX.WorkBook, name: string): T[] {
  const ws = wb.Sheets[name]
  if (!ws) return []
  return XLSX.utils.sheet_to_json<T>(ws, { defval: null, raw: false })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const buffer = await req.arrayBuffer()
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buffer, { type: "buffer", cellDates: false })
  } catch {
    return NextResponse.json({ error: "Could not parse Excel file." }, { status: 400 })
  }

  // Teams sheet has one row per player — re-group into ExportTeam[]
  const teamRows = sheet<{ sessionDate: string; teamName: string; playerEmail: string }>(wb, "Teams")
  const teamMap = new Map<string, ExportTeam>()
  for (const row of teamRows) {
    const key = `${row.sessionDate}:${row.teamName}`
    if (!teamMap.has(key)) {
      teamMap.set(key, { sessionDate: row.sessionDate, name: row.teamName, playerEmails: [] })
    }
    if (row.playerEmail) teamMap.get(key)!.playerEmails.push(row.playerEmail)
  }

  // Read scope from the Metadata sheet written by the exporter
  const metaRows = sheet<{ version: string; scope: string; seasonYear: string }>(wb, "Metadata")
  const meta = metaRows[0]
  const scope = meta?.scope === "season" ? "season" : "all"
  const seasonYear = scope === "season" && meta?.seasonYear ? Number(meta.seasonYear) : undefined

  let bundle: ExportBundle = {
    exportedAt: new Date().toISOString(),
    version: 2,
    scope,
    ...(seasonYear !== undefined ? { seasonYear } : {}),
    players:       sheet(wb, "Players"),
    seasons:       sheet(wb, "Seasons"),
    sessions:      sheet(wb, "Sessions"),
    registrations: sheet(wb, "Registrations"),
    teams:         [...teamMap.values()],
    matches:       sheet(wb, "Matches"),
    goals:         sheet(wb, "Goals"),
    fees:          sheet(wb, "Fees"),
    seasonStats:   sheet(wb, "SeasonStats"),
    lifetimeStats: sheet(wb, "LifetimeStats"),
  }

  const importSeasonYear = req.nextUrl.searchParams.get("season")
  if (importSeasonYear) {
    try {
      bundle = filterBundleToSeason(bundle, Number(importSeasonYear))
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 })
    }
  }

  try {
    await importBundle(bundle)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}