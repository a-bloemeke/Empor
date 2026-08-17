import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import { SessionClient } from "./session-client"
import { buildPlayerNames } from "@/lib/player-names"

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authSession = await auth()
  const currentUserId = authSession?.user?.id ?? ""
  const isOrganizer = authSession?.user?.role === "ORGANIZER"

  const session = await db.session.findUnique({
    where: { id },
    include: {
      season: { select: { year: true } },
      registrations: {
        include: { player: { select: { id: true, firstName: true, lastName: true, nickname: true, passwordHash: true } } },
        orderBy: { registeredAt: "asc" },
      },
      teams: {
        include: {
          players: {
            include: { player: { select: { id: true, firstName: true, lastName: true, nickname: true } } },
          },
        },
        orderBy: { name: "asc" },
      },
      matches: {
        include: {
          homeTeam: { select: { id: true, name: true } },
          awayTeam: { select: { id: true, name: true } },
          goals: {
            include: {
              scoredBy: { select: { id: true, firstName: true, lastName: true, nickname: true } },
              assistedBy: { select: { id: true, firstName: true, lastName: true, nickname: true } },
            },
            orderBy: { scoredAt: "asc" },
          },
        },
        orderBy: [{ roundNumber: "asc" }, { startedAt: "asc" }],
      },
    },
  })
  if (!session) notFound()

  // Season ranking: fetch all stats for this season, sort by points, assign ranks
  const allSeasonStats = await db.playerStats.findMany({
    where: { seasonId: session.seasonId },
    orderBy: [{ points: "desc" }, { score: "desc" }],
  })
  const rankByPlayerId = new Map<string, number>()
  let rank = 1
  for (let i = 0; i < allSeasonStats.length; i++) {
    if (i > 0 && allSeasonStats[i].points < allSeasonStats[i - 1].points) rank = i + 1
    rankByPlayerId.set(allSeasonStats[i].playerId, rank)
  }
  const pointsByPlayerId = new Map(allSeasonStats.map((s) => [s.playerId, s.points]))
  const sessionsByPlayerId = new Map(allSeasonStats.map((s) => [s.playerId, s.sessionsPlayed]))
  const scoreByPlayerId = new Map(allSeasonStats.map((s) => [s.playerId, s.score]))

  // All historical stats across all past seasons (for fallback strength computation)
  const allHistoricalStats = await db.playerStats.findMany({
    where: { seasonId: { not: session.seasonId }, sessionsPlayed: { gt: 0 } },
  })
  const historicalByPlayerId = new Map<string, { points: number; sessionsPlayed: number; score: number }[]>()
  for (const s of allHistoricalStats) {
    const arr = historicalByPlayerId.get(s.playerId) ?? []
    arr.push(s)
    historicalByPlayerId.set(s.playerId, arr)
  }

  // Lifetime stats for registered players (needed for balanced-team preview)
  const registeredPlayerIds = session.registrations.map((r) => r.playerId)

  function strFromStats(s: { points: number; sessionsPlayed: number; score: number }): number {
    return 0.6 * ((s.points - s.sessionsPlayed) / s.sessionsPlayed)
      + 0.4 * (s.score / s.sessionsPlayed)
  }

  function rawStrength(playerId: string): number | null {
    const curSessions = sessionsByPlayerId.get(playerId) ?? 0
    if (curSessions > 0) {
      const curStr = 0.6 * ((pointsByPlayerId.get(playerId)! - curSessions) / curSessions)
        + 0.4 * ((scoreByPlayerId.get(playerId) ?? 0) / curSessions)
      const hist = historicalByPlayerId.get(playerId)
      const prevStr = hist && hist.length > 0
        ? hist.reduce((sum, s) => sum + strFromStats(s), 0) / hist.length
        : null
      return prevStr !== null ? 0.6 * curStr + 0.4 * prevStr : curStr
    }
    // (a) no current-season data → average of all past seasons played
    const hist = historicalByPlayerId.get(playerId)
    if (hist && hist.length > 0) {
      return hist.reduce((sum, s) => sum + strFromStats(s), 0) / hist.length
    }
    return null
  }

  // (b) new players / guests with no history → session average of players with known strength
  const knownStrengths = registeredPlayerIds.map(rawStrength).filter((s): s is number => s !== null)
  const sessionAvg = knownStrengths.length > 0
    ? knownStrengths.reduce((a, b) => a + b, 0) / knownStrengths.length
    : 0

  function computeBlendedStrength(playerId: string): number {
    return rawStrength(playerId) ?? sessionAvg
  }

  const lifetimeStatsRows = await db.playerStatsLifetime.findMany({
    where: { playerId: { in: registeredPlayerIds } },
  })
  const lifetimeByPlayerId = new Map(lifetimeStatsRows.map((s) => [s.playerId, s]))

  // All non-guest players (guests are always added explicitly; exclude from "no answer")
  const allPlayers = await db.player.findMany({
    where: { passwordHash: { not: null }, active: true },
    select: { id: true, firstName: true, lastName: true, nickname: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })

  const displayNames = buildPlayerNames(allPlayers)
  const pName = (p: { id: string; firstName: string; lastName: string }) =>
    displayNames.get(p.id) ?? `${p.firstName} ${p.lastName}`.trim()

  const myStatus = session.registrations.find((r) => r.playerId === currentUserId)?.status ?? null

  // Absent players: those with an absence covering this session's date
  const absentPlayers = await db.playerAbsence.findMany({
    where: {
      startDate: { lte: session.date },
      endDate: { gte: session.date },
    },
    include: { player: { select: { id: true, firstName: true, lastName: true, nickname: true } } },
  })

  return (
    <SessionClient
      session={{
        id: session.id,
        date: session.date.toISOString(),
        status: session.status as string,
        seasonYear: session.season.year,
        registrations: session.registrations.map((r) => {
          const lt = lifetimeByPlayerId.get(r.playerId)
          return {
            playerId: r.playerId,
            playerName: pName(r.player),
            status: r.status as string,
            beerBringer: r.beerBringer,
            isGuest: !r.player.passwordHash,
            seasonPoints: pointsByPlayerId.get(r.playerId) ?? 0,
            seasonSessions: sessionsByPlayerId.get(r.playerId) ?? 0,
            seasonScore: scoreByPlayerId.get(r.playerId) ?? 0,
            strength: computeBlendedStrength(r.playerId),
            lifetimePoints: lt?.points ?? 0,
            lifetimeSessions: lt?.sessionsPlayed ?? 0,
            lifetimeScore: lt?.score ?? 0,
          }
        }),
        teams: session.teams.map((t) => ({
          id: t.id,
          name: t.name,
          players: t.players.map((tp) => ({
            id: tp.player.id,
            name: pName(tp.player),
            displayName: pName(tp.player),
            seasonPoints: pointsByPlayerId.get(tp.player.id) ?? 0,
            seasonSessions: sessionsByPlayerId.get(tp.player.id) ?? 0,
            seasonScore: scoreByPlayerId.get(tp.player.id) ?? 0,
            strength: computeBlendedStrength(tp.player.id),
            seasonRank: rankByPlayerId.get(tp.player.id) ?? null,
          })),
        })),
        matches: session.matches.map((m) => ({
          id: m.id,
          roundNumber: m.roundNumber,
          homeTeamId: m.homeTeamId,
          homeTeamName: m.homeTeam.name,
          awayTeamId: m.awayTeamId,
          awayTeamName: m.awayTeam.name,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          status: m.status as string,
          endCondition: m.endCondition as string | null,
          startedAt: m.startedAt?.toISOString() ?? null,
          goals: m.goals.map((g) => ({
            id: g.id,
            scoredByPlayerId: g.scoredByPlayerId,
            scoredByName: pName(g.scoredBy),
            assistedByPlayerId: g.assistedByPlayerId,
            assistedByName: g.assistedBy ? pName(g.assistedBy) : null,
            teamId: g.teamId,
            scoredAt: g.scoredAt.toISOString(),
          })),
        })),
        allPlayers: allPlayers.map((p) => ({ id: p.id, name: pName(p), displayName: pName(p), seasonPoints: 0, seasonSessions: 0, seasonScore: 0, strength: 0, seasonRank: null })),
        absentPlayers: absentPlayers.map((a) => ({ id: a.playerId, name: pName(a.player) })),
        myStatus,
        maxPlayers: session.maxPlayers ?? null,
      }}
      currentUserId={currentUserId}
      isOrganizer={isOrganizer}
    />
  )
}
