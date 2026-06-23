import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { SeasonsClient } from "./seasons-client"

export default async function SeasonsPage() {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") redirect("/schedule")

  const seasons = await db.season.findMany({
    orderBy: { year: "desc" },
    include: { _count: { select: { sessions: true } } },
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Seasons</h1>
      <p className="text-muted-foreground mb-6">Manage annual seasons and their lifecycle.</p>
      <SeasonsClient
        seasons={seasons.map((s) => ({
          id: s.id,
          year: s.year,
          status: s.status,
          sessionCount: s._count.sessions,
        }))}
      />
    </div>
  )
}
