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
        include: { player: { select: { id: true, firstName: true, lastName: true, nickname: true } } },
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

  // Previous season stats for blended strength display
  const seasons = await db.season.findMany({ orderBy: { year: "desc" }, take: 2, select: { id: true } })
  const prevSeasonId = seasons.find((s) => s.id !== session.seasonId)?.id ?? null
  const prevSeasonStats = prevSeasonId
    ? await db.playerStats.findMany({ where: { seasonId: prevSeasonId } })
    : []
  const prevByPlayerId = new Map(prevSeasonStats.map((s) => [s.playerId, s]))

  function computeBlendedStrength(playerId: string): number {
    const curSessions = sessionsByPlayerId.get(playerId) ?? 0
    const curStr = curSessions > 0
      ? 0.6 * ((pointsByPlayerId.get(playerId)! - curSessions) / curSessions)
        + 0.4 * ((scoreByPlayerId.get(playerId) ?? 0) / curSessions)
      : null
    const prev = prevByPlayerId.get(playerId)
    const prevStr = prev && prev.sessionsPlayed > 0
      ? 0.6 * ((prev.points - prev.sessionsPlayed) / prev.sessionsPlayed)
        + 0.4 * (prev.score / prev.sessionsPlayed)
      : null
    const lt = allSeasonStats.find((s) => s.playerId === playerId)
    const ltStr = lt && lt.sessionsPlayed > 0
      ? 0.6 * ((lt.points - lt.sessionsPlayed) / lt.sessionsPlayed) + 0.4 * (lt.score / lt.sessionsPlayed)
      : 0
    const cur = curStr ?? ltStr
    const prv = prevStr ?? ltStr
    return 0.6 * cur + 0.4 * prv
  }

  // Lifetime stats for registered players (needed for balanced-team preview)
  const registeredPlayerIds = session.registrations.map((r) => r.playerId)
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
  const pName = (p: { id: string }) => displayNames.get(p.id) ?? p.id

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
      }}
      currentUserId={currentUserId}
      isOrganizer={isOrganizer}
    />
  )
}
