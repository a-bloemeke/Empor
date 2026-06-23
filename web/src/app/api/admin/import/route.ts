import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { importBundle, filterBundleToSeason, type ExportBundle } from "@/lib/export-data"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let data: ExportBundle
  try {
    data = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }

  const seasonYear = req.nextUrl.searchParams.get("season")
  if (seasonYear) {
    try {
      data = filterBundleToSeason(data, Number(seasonYear))
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 })
    }
  }

  try {
    await importBundle(data)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
