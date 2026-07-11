import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import { ScoreboardClient } from "./scoreboard-client"

export default async function ScoreboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authSession = await auth()
  const currentUserId = authSession?.user?.id ?? ""

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

  const activeMatch = s.matches.find((m) => m.status === "IN_PROGRESS") ?? null

  // For normal matches (no roundNumber): count completed matches between same two teams.
  // Odd count → auto-swap display so teams alternate sides on each rematch.
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
    // Tournament: desired display pattern alternates per round.
    // Odd rounds:  pos1=normal, pos2=swap, pos3=swap  (A-B, C-B, C-A)
    // Even rounds: pos1=swap,   pos2=normal, pos3=normal  (B-A, B-C, A-C)
    const roundMatches = s.matches
      .filter((m) => m.roundNumber === activeMatch.roundNumber)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
    const posInRound = roundMatches.findIndex((m) => m.id === activeMatch.id) + 1
    const isOddRound = activeMatch.roundNumber % 2 === 1
    initialSwapped = isOddRound ? posInRound >= 2 : posInRound === 1
  }

  return (
    <ScoreboardClient
      sessionId={id}
      currentUserId={currentUserId}
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
      teams={s.teams.map((t) => ({
        id: t.id,
        name: t.name,
        players: t.players.map((tp) => ({
          id: tp.player.id,
          name: playerName(tp.player),
          displayName: displayName(tp.player),
          seasonPoints: pointsByPlayerId.get(tp.player.id) ?? 0,
          seasonRank: rankByPlayerId.get(tp.player.id) ?? null,
        })),
      }))}
    />
  )
}
