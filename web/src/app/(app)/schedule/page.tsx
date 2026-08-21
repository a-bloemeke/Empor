import { auth } from "@/auth"
import { db } from "@/lib/db"
import { ScheduleClient } from "./schedule-client"
import { getTranslations } from "next-intl/server"

export default async function SchedulePage() {
  const authSession = await auth()
  const isOrganizer = authSession?.user?.role === "ORGANIZER"
  const currentUserId = authSession?.user?.id ?? ""
  const t = await getTranslations("schedule")

  const now = new Date()
  const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  const [sessions, upcomingClosures] = await Promise.all([
    db.session.findMany({
      orderBy: { date: "asc" },
      include: {
        season: { select: { year: true } },
        _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
      },
    }),
    db.hallClosure.findMany({
      where: { endDate: { gte: todayUTC }, startDate: { lte: twoWeeksFromNow } },
      orderBy: { startDate: "asc" },
    }).catch(() => [] as { id: string; startDate: Date; endDate: Date; reason: string | null; createdAt: Date }[]),
  ])

  // Load current user's registrations
  const myRegistrations = currentUserId
    ? await db.sessionRegistration.findMany({
        where: { playerId: currentUserId },
        select: { sessionId: true, status: true },
      })
    : []
  const myRegMap = new Map(myRegistrations.map((r) => [r.sessionId, r.status]))

  // Load beer bringers for all sessions
  const beerRegs = await db.sessionRegistration.findMany({
    where: { beerBringer: true },
    select: {
      sessionId: true,
      playerId: true,
      player: { select: { firstName: true, nickname: true } },
    },
  })
  const beerMap = new Map(beerRegs.map((r) => [r.sessionId, r]))

  const toRow = (s: (typeof sessions)[number]) => {
    const beerReg = beerMap.get(s.id)
    return {
      id: s.id,
      date: s.date.toISOString(),
      status: s.status as string,
      seasonYear: s.season.year,
      registrationCount: s._count.registrations,
      maxPlayers: s.maxPlayers ?? null,
      myStatus: (myRegMap.get(s.id) ?? null) as string | null,
      beerBringerId: beerReg?.playerId ?? null,
      beerBringerName: beerReg ? (beerReg.player.nickname ?? beerReg.player.firstName) : null,
      myBeer: beerReg?.playerId === currentUserId,
    }
  }

  const upcoming = sessions
    .filter((s) => s.date >= now && s.status !== "CANCELLED")
    .map(toRow)

  const past = sessions
    .filter((s) => s.date < now || s.status === "CANCELLED")
    .reverse()
    .map(toRow)

  const closures = upcomingClosures.map((c) => ({
    id: c.id,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    reason: c.reason,
  }))

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">{t("title")}</h1>
      <p className="text-muted-foreground mb-6">{t("subtitle")}</p>
      <ScheduleClient
        upcoming={upcoming}
        past={past}
        isOrganizer={isOrganizer}
        currentUserId={currentUserId}
        closures={closures}
      />
    </div>
  )
}
