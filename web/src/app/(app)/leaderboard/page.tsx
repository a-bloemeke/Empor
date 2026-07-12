import { db } from "@/lib/db"
import { LeaderboardClient } from "./leaderboard-client"
import { buildPlayerNames } from "@/lib/player-names"

export default async function LeaderboardPage() {
  const seasons = await db.season.findMany({ orderBy: { year: "desc" } })
  const currentSeason = seasons.find((s) => s.status === "ACTIVE") ?? seasons[0]

  const seasonStats = currentSeason
    ? await db.playerStats.findMany({
        where: { seasonId: currentSeason.id },
        include: { player: { select: { id: true, firstName: true, lastName: true, nickname: true } } },
      })
    : []

  // Aggregate lifetime stats across all seasons directly from PlayerStats
  const allStats = await db.playerStats.findMany({
    include: { player: { select: { id: true, firstName: true, lastName: true, nickname: true } } },
  })

  const lifetimeMap = new Map<string, {
    player: { id: string; firstName: string; lastName: string; nickname: string | null }
    sessionsPlayed: number; matchesPlayed: number; goals: number; assists: number; score: number; points: number; beers: number
  }>()

  for (const s of allStats) {
    const existing = lifetimeMap.get(s.playerId)
    if (existing) {
      existing.sessionsPlayed += s.sessionsPlayed
      existing.matchesPlayed += s.matchesPlayed
      existing.goals += s.goals
      existing.assists += s.assists
      existing.score += s.score
      existing.points += s.points
      existing.beers += s.beers
    } else {
      lifetimeMap.set(s.playerId, {
        player: s.player,
        sessionsPlayed: s.sessionsPlayed,
        matchesPlayed: s.matchesPlayed,
        goals: s.goals,
        assists: s.assists,
        score: s.score,
        points: s.points,
        beers: s.beers,
      })
    }
  }

  // Build display names with conflict detection across ALL known players
  const allPlayers = [...new Map(allStats.map((s) => [s.player.id, s.player])).values()]
  const displayNames = buildPlayerNames(allPlayers)

  return (
    <LeaderboardClient
      seasons={seasons.map((s) => ({ id: s.id, year: s.year, status: s.status as string }))}
      currentSeasonId={currentSeason?.id ?? null}
      initialSeasonStats={seasonStats.map((s) => ({
        playerId: s.playerId,
        playerName: displayNames.get(s.playerId) ?? s.player.firstName,
        sessionsPlayed: s.sessionsPlayed,
        matchesPlayed: s.matchesPlayed,
        goals: s.goals,
        assists: s.assists,
        score: s.score,
        points: s.points,
        beers: s.beers,
        seasonId: s.seasonId,
      }))}
      lifetimeStats={[...lifetimeMap.values()].map((s) => ({
        playerId: s.player.id,
        playerName: displayNames.get(s.player.id) ?? s.player.firstName,
        sessionsPlayed: s.sessionsPlayed,
        matchesPlayed: s.matchesPlayed,
        goals: s.goals,
        assists: s.assists,
        score: s.score,
        points: s.points,
        beers: s.beers,
      }))}
    />
  )
}
