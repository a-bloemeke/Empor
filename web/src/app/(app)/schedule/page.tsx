import { auth } from "@/auth"
import { db } from "@/lib/db"
import { ScheduleClient } from "./schedule-client"

export default async function SchedulePage() {
  const authSession = await auth()
  const isOrganizer = authSession?.user?.role === "ORGANIZER"
  const currentUserId = authSession?.user?.id ?? ""

  const sessions = await db.session.findMany({
    orderBy: { date: "asc" },
    include: {
      season: { select: { year: true } },
      _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
    },
  })

  // Load current user's registrations
  const myRegistrations = currentUserId
    ? await db.sessionRegistration.findMany({
        where: { playerId: currentUserId },
        select: { sessionId: true, status: true },
      })
    : []
  const myRegMap = new Map(myRegistrations.map((r) => [r.sessionId, r.status]))

  const now = new Date()

  const toRow = (s: (typeof sessions)[number]) => ({
    id: s.id,
    date: s.date.toISOString(),
    status: s.status as string,
    seasonYear: s.season.year,
    registrationCount: s._count.registrations,
    myStatus: (myRegMap.get(s.id) ?? null) as string | null,
  })

  const upcoming = sessions
    .filter((s) => s.date >= now && s.status !== "CANCELLED")
    .map(toRow)

  const past = sessions
    .filter((s) => s.date < now || s.status === "CANCELLED")
    .reverse()
    .map(toRow)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Schedule</h1>
      <p className="text-muted-foreground mb-6">Upcoming and past game days.</p>
      <ScheduleClient
        upcoming={upcoming}
        past={past}
        isOrganizer={isOrganizer}
        currentUserId={currentUserId}
      />
    </div>
  )
}
