import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { ClosuresClient } from "./closures-client"

export default async function ClosuresPage() {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") redirect("/schedule")

  const [closures, sessions] = await Promise.all([
    db.hallClosure.findMany({ orderBy: { startDate: "asc" } }),
    db.session.findMany({
      where: { status: "SCHEDULED" },
      select: { id: true, date: true },
      orderBy: { date: "asc" },
    }),
  ])

  return (
    <ClosuresClient
      closures={closures.map((c) => ({
        id: c.id,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate.toISOString(),
        reason: c.reason,
      }))}
      sessions={sessions.map((s) => ({
        id: s.id,
        date: s.date.toISOString(),
      }))}
    />
  )
}
