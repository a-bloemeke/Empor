import { db } from "@/lib/db"
import { LeaderboardClient } from "./leaderboard-client"

export default async function LeaderboardPage() {
  const seasons = await db.season.findMany({ orderBy: { year: "desc" } })
  const currentSeason = seasons.find((s) => s.status === "ACTIVE") ?? seasons[0]

  const seasonStats = currentSeason
    ? await db.playerStats.findMany({
        where: { seasonId: currentSeason.id },
        include: { player: { select: { id: true, firstName: true, lastName: true, nickname: true } } },
      })
    : []

  const lifetimeStats = await db.playerStatsLifetime.findMany({
    include: { player: { select: { id: true, firstName: true, lastName: true, nickname: true } } },
  })

  function playerName(p: { firstName: string; lastName: string; nickname: string | null }) {
    return p.nickname ? `${p.firstName} ${p.lastName} (${p.nickname})` : `${p.firstName} ${p.lastName}`
  }

  return (
    <LeaderboardClient
      seasons={seasons.map((s) => ({ id: s.id, year: s.year, status: s.status as string }))}
      currentSeasonId={currentSeason?.id ?? null}
      initialSeasonStats={seasonStats.map((s) => ({
        playerId: s.playerId,
        playerName: playerName(s.player),
        sessionsPlayed: s.sessionsPlayed,
        matchesPlayed: s.matchesPlayed,
        goals: s.goals,
        assists: s.assists,
        score: s.score,
        points: s.points,
        seasonId: s.seasonId,
      }))}
      lifetimeStats={lifetimeStats.map((s) => ({
        playerId: s.playerId,
        playerName: playerName(s.player),
        sessionsPlayed: s.sessionsPlayed,
        matchesPlayed: s.matchesPlayed,
        goals: s.goals,
        assists: s.assists,
        score: s.score,
        points: s.points,
      }))}
    />
  )
}
