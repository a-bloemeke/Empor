import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { DataClient } from "./data-client"

export default async function DataPage() {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") redirect("/schedule")

  const seasons = await db.season.findMany({ orderBy: { year: "desc" } })

  return (
    <DataClient
      seasons={seasons.map((s) => ({ year: s.year, status: s.status as string }))}
    />
  )
}
