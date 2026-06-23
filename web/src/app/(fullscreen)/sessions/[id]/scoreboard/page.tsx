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
        where: { status: "IN_PROGRESS" },
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
      },
    },
  })
  if (!session) notFound()

  const playerName = (p: { firstName: string; lastName: string; nickname: string | null }) =>
    p.nickname ? `${p.firstName} ${p.lastName} (${p.nickname})` : `${p.firstName} ${p.lastName}`

  const displayName = (p: { firstName: string; nickname: string | null }) =>
    p.nickname ?? p.firstName

  // Fetch ALL season stats to compute global ranking, not just the players in this session
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

  const activeMatch = session.matches[0] ?? null

  return (
    <ScoreboardClient
      sessionId={id}
      currentUserId={currentUserId}
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
      teams={session.teams.map((t) => ({
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
