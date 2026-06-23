import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import { PlayerClient } from "./player-client"

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authSession = await auth()
  const currentUserId = authSession?.user?.id ?? ""
  const isOrganizer = authSession?.user?.role === "ORGANIZER"
  const isCurrentUser = currentUserId === id

  const player = await db.player.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      dateOfBirth: true,
      addressStreet: true,
      addressCity: true,
      addressPostalCode: true,
      email: true,
      role: true,
    },
  })
  if (!player) notFound()

  const seasons = await db.season.findMany({ orderBy: { year: "desc" } })

  const seasonStats = await db.playerStats.findMany({
    where: { playerId: id },
    include: { season: { select: { year: true } } },
    orderBy: { season: { year: "desc" } },
  })

  const lifetimeStats = await db.playerStatsLifetime.findUnique({ where: { playerId: id } })

  const currentYear = new Date().getFullYear()
  const fees = (isCurrentUser || isOrganizer)
    ? await db.membershipFee.findMany({
        where: { playerId: id },
        orderBy: { year: "desc" },
      })
    : []

  return (
    <PlayerClient
      player={{
        id: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        nickname: player.nickname,
        dateOfBirth: player.dateOfBirth?.toISOString() ?? null,
        addressStreet: player.addressStreet,
        addressCity: player.addressCity,
        addressPostalCode: player.addressPostalCode,
        email: player.email,
        role: player.role as string,
      }}
      seasons={seasons.map((s) => ({ id: s.id, year: s.year }))}
      seasonStats={seasonStats.map((s) => ({
        seasonId: s.seasonId,
        year: s.season.year,
        sessionsPlayed: s.sessionsPlayed,
        matchesPlayed: s.matchesPlayed,
        goals: s.goals,
        assists: s.assists,
        score: s.score,
        points: s.points,
      }))}
      lifetimeStats={
        lifetimeStats
          ? {
              sessionsPlayed: lifetimeStats.sessionsPlayed,
              matchesPlayed: lifetimeStats.matchesPlayed,
              goals: lifetimeStats.goals,
              assists: lifetimeStats.assists,
              score: lifetimeStats.score,
              points: lifetimeStats.points,
            }
          : null
      }
      fees={fees.map((f) => ({
        year: f.year,
        status: f.status as string,
        paidAt: f.paidAt?.toISOString() ?? null,
      }))}
      currentYear={currentYear}
      isCurrentUser={isCurrentUser}
      isOrganizer={isOrganizer}
      canEdit={isCurrentUser || isOrganizer}
    />
  )
}
