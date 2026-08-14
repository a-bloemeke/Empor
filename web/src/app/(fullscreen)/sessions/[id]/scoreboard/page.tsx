import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import { ScoreboardClient } from "./scoreboard-client"

export default async function ScoreboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authSession = await auth()
  const currentUserId = authSession?.user?.id ?? ""
  const isOrganizer = authSession?.user?.role === "ORGANIZER"

  const session = await db.session.findUnique({
    where: { id },
    include: {
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
        orderBy: { id: "asc" },
      },
    },
  })
  if (!session) notFound()
  // notFound() throws but TS doesn't always narrow — explicit cast for type safety
  const s = session!

  const playerName = (p: { firstName: string; lastName: string; nickname: string | null }) =>
    p.nickname ? `${p.firstName} ${p.lastName} (${p.nickname})` : `${p.firstName} ${p.lastName}`

  const displayName = (p: { firstName: string; nickname: string | null }) =>
    p.nickname ?? p.firstName

  // Fetch ALL season stats to compute global ranking, not just the players in this session
  const allSeasonStats = await db.playerStats.findMany({
    where: { seasonId: s.seasonId },
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

  // Previous season for blended strength
  const allSeasons = await db.season.findMany({ orderBy: { year: "desc" }, take: 2, select: { id: true } })
  const prevSeasonId = allSeasons.find((season) => season.id !== s.seasonId)?.id ?? null
  const prevSeasonStats = prevSeasonId
    ? await db.playerStats.findMany({ where: { seasonId: prevSeasonId } })
    : []
  const prevByPlayerId = new Map(prevSeasonStats.map((ps) => [ps.playerId, ps]))

  function computeStrength(playerId: string): number {
    const curSessions = sessionsByPlayerId.get(playerId) ?? 0
    const curStr = curSessions > 0
      ? 0.6 * ((pointsByPlayerId.get(playerId)! - curSessions) / curSessions)
        + 0.4 * ((scoreByPlayerId.get(playerId) ?? 0) / curSessions)
      : null
    const prev = prevByPlayerId.get(playerId)
    const prevStr = prev && prev.sessionsPlayed > 0
      ? 0.6 * ((prev.points - prev.sessionsPlayed) / prev.sessionsPlayed) + 0.4 * (prev.score / prev.sessionsPlayed)
      : null
    const lt = curStr ?? 0
    const cur = curStr ?? lt
    const prv = prevStr ?? lt
    return 0.6 * cur + 0.4 * prv
  }

  const activeMatch = s.matches.find((m) => m.status === "IN_PROGRESS") ?? null
  const pendingMatchesRaw = s.matches.filter((m) => m.status === "PENDING")

  // For normal matches (no roundNumber): alternate sides on rematches between same two teams.
  let initialSwapped = false
  if (activeMatch && activeMatch.roundNumber === null) {
    const { homeTeamId, awayTeamId } = activeMatch
    const priorCount = s.matches.filter(
      (m) =>
        m.status === "COMPLETED" &&
        m.roundNumber === null &&
        ((m.homeTeamId === homeTeamId && m.awayTeamId === awayTeamId) ||
          (m.homeTeamId === awayTeamId && m.awayTeamId === homeTeamId)),
    ).length
    initialSwapped = priorCount % 2 === 1
  } else if (activeMatch && activeMatch.roundNumber !== null) {
    // Tournament: keep the shared team on the same side as they'll appear in the next match.
    // Find the first pending match in this round and check which current team is in it.
    const nextPending = pendingMatchesRaw.find((m) => m.roundNumber === activeMatch.roundNumber)
    if (nextPending) {
      // The shared team is the one that appears in both the active and the next match.
      // Determine which side of the next match they're on (home=left, away=right).
      // Then swap the active match display so that shared team is already on that same side.
      const activeHomeIsNext = nextPending.homeTeamId === activeMatch.homeTeamId || nextPending.awayTeamId === activeMatch.homeTeamId
      const activeAwayIsNext = nextPending.homeTeamId === activeMatch.awayTeamId || nextPending.awayTeamId === activeMatch.awayTeamId
      if (activeHomeIsNext) {
        // active homeTeam is shared → it should appear on the same side in the current match
        // as it will in the next match. In the next match, is it home (left)?
        const sharedIsHomeInNext = nextPending.homeTeamId === activeMatch.homeTeamId
        // no swap: active home stays left (=home in next). swap: active home moves right.
        initialSwapped = !sharedIsHomeInNext
      } else if (activeAwayIsNext) {
        // active awayTeam is shared
        const sharedIsHomeInNext = nextPending.homeTeamId === activeMatch.awayTeamId
        // active away is currently right. sharedIsHomeInNext means it should be left → swap.
        initialSwapped = sharedIsHomeInNext
      }
    } else {
      // Last match in round — use position-based alternation as fallback
      const roundMatches = s.matches
        .filter((m) => m.roundNumber === activeMatch.roundNumber)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
      const posInRound = roundMatches.findIndex((m) => m.id === activeMatch.id) + 1
      const isOddRound = activeMatch.roundNumber % 2 === 1
      initialSwapped = isOddRound ? posInRound >= 2 : posInRound === 1
    }
  }

  return (
    <ScoreboardClient
      sessionId={id}
      currentUserId={currentUserId}
      isOrganizer={isOrganizer}
      initialSwapped={initialSwapped}
      activeMatch={
        activeMatch
          ? {
              id: activeMatch.id,
              homeTeamId: activeMatch.homeTeamId,
              homeTeamName: activeMatch.homeTeam.name,
              awayTeamId: activeMatch.awayTeamId,
              awayTeamName: activeMatch.awayTeam.name,
              homeScore: activeMatch.homeScore,
              awayScore: activeMatch.awayScore,
              roundNumber: activeMatch.roundNumber,
              goals: activeMatch.goals.map((g) => ({
                id: g.id,
                scoredByName: playerName(g.scoredBy),
                assistedByName: g.assistedBy ? playerName(g.assistedBy) : null,
                teamId: g.teamId,
                scoredAt: g.scoredAt.toISOString(),
              })),
            }
          : null
      }
      pendingMatches={pendingMatchesRaw.map((m) => {
        const homeTeam = s.teams.find((t) => t.id === m.homeTeamId)
        const awayTeam = s.teams.find((t) => t.id === m.awayTeamId)
        return {
          id: m.id,
          roundNumber: m.roundNumber,
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          homeTeamName: m.homeTeam.name,
          awayTeamName: m.awayTeam.name,
          homeTeamPlayers: (homeTeam?.players ?? []).map((tp) => displayName(tp.player)),
          awayTeamPlayers: (awayTeam?.players ?? []).map((tp) => displayName(tp.player)),
        }
      })}
      teams={s.teams.map((t) => ({
        id: t.id,
        name: t.name,
        players: t.players.map((tp) => ({
          id: tp.player.id,
          name: playerName(tp.player),
          displayName: displayName(tp.player),
          seasonPoints: pointsByPlayerId.get(tp.player.id) ?? 0,
          seasonSessions: sessionsByPlayerId.get(tp.player.id) ?? 0,
          seasonScore: scoreByPlayerId.get(tp.player.id) ?? 0,
          strength: computeStrength(tp.player.id),
          seasonRank: rankByPlayerId.get(tp.player.id) ?? null,
        })),
      }))}
    />
  )
}
