import { db } from "@/lib/db"
import type { PointsScope } from "@/lib/types"

export type { PointsScope }

export async function computeAndSaveStats(sessionId: string, pointsScope: PointsScope = "all") {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      teams: { include: { players: true } },
      matches: {
        where: { status: "COMPLETED" },
        include: {
          goals: true,
          homeTeam: { include: { players: true } },
          awayTeam: { include: { players: true } },
        },
      },
    },
  })
  if (!session) throw new Error("Session not found")

  // All completed matches regardless of scope
  const allMatches = session.matches

  // Goals and assists always counted across all matches
  const playerGoals = new Map<string, number>()
  const playerAssists = new Map<string, number>()
  const playerMatchKeys = new Set<string>()

  for (const match of allMatches) {
    const homePlayers = match.homeTeam.players.map((p) => p.playerId)
    const awayPlayers = match.awayTeam.players.map((p) => p.playerId)
    homePlayers.forEach((id) => playerMatchKeys.add(`${match.id}:${id}`))
    awayPlayers.forEach((id) => playerMatchKeys.add(`${match.id}:${id}`))
    for (const goal of match.goals) {
      playerGoals.set(goal.scoredByPlayerId, (playerGoals.get(goal.scoredByPlayerId) ?? 0) + 1)
      if (goal.assistedByPlayerId) {
        playerAssists.set(goal.assistedByPlayerId, (playerAssists.get(goal.assistedByPlayerId) ?? 0) + 1)
      }
    }
  }

  const playerMatchCount = new Map<string, number>()
  for (const key of playerMatchKeys) {
    const id = key.split(":")[1]
    playerMatchCount.set(id, (playerMatchCount.get(id) ?? 0) + 1)
  }

  // Points — determined by scope
  const playerPoints = new Map<string, number>()

  if (pointsScope !== "none") {
    const tournamentMatches = allMatches.filter((m) => m.roundNumber != null)
    const normalMatches = allMatches.filter((m) => m.roundNumber == null)

    // Tournament points (placement-based)
    if ((pointsScope === "all" || pointsScope === "tournament") && tournamentMatches.length > 0) {
      const tournamentTeamIds = new Set(tournamentMatches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))
      const tournamentTeams = session.teams.filter((t) => tournamentTeamIds.has(t.id))

      const teamStats = new Map<string, { pts: number; gf: number; ga: number }>()
      for (const team of tournamentTeams) teamStats.set(team.id, { pts: 0, gf: 0, ga: 0 })

      for (const match of tournamentMatches) {
        const h = teamStats.get(match.homeTeamId)!
        const a = teamStats.get(match.awayTeamId)!
        if (match.homeScore > match.awayScore) { h.pts += 3 } else if (match.homeScore < match.awayScore) { a.pts += 3 } else { h.pts += 1; a.pts += 1 }
        h.gf += match.homeScore; h.ga += match.awayScore
        a.gf += match.awayScore; a.ga += match.homeScore
      }

      const sorted = [...tournamentTeams].sort((a, b) => {
        const sa = teamStats.get(a.id)!; const sb = teamStats.get(b.id)!
        if (sa.pts !== sb.pts) return sb.pts - sa.pts
        const gdDiff = (sb.gf - sb.ga) - (sa.gf - sa.ga)
        return gdDiff !== 0 ? gdDiff : sb.gf - sa.gf
      })

      // Only award placement points when we have exactly 3 tournament teams
      if (tournamentTeams.length === 3) {
        const eq = (a: string, b: string) => {
          const sa = teamStats.get(a)!; const sb = teamStats.get(b)!
          return sa.pts === sb.pts && (sa.gf - sa.ga) === (sb.gf - sb.ga) && sa.gf === sb.gf
        }
        const allTied = eq(sorted[0].id, sorted[1].id) && eq(sorted[1].id, sorted[2].id)
        const topTied = eq(sorted[0].id, sorted[1].id)
        const bottomTied = eq(sorted[1].id, sorted[2].id)
        const award = new Map<string, number>()
        if (allTied) { for (const t of sorted) award.set(t.id, 3) }
        else if (topTied) { award.set(sorted[0].id, 6); award.set(sorted[1].id, 6); award.set(sorted[2].id, 0) }
        else if (bottomTied) { award.set(sorted[0].id, 6); award.set(sorted[1].id, 3); award.set(sorted[2].id, 3) }
        else { award.set(sorted[0].id, 6); award.set(sorted[1].id, 3); award.set(sorted[2].id, 0) }
        for (const team of tournamentTeams) {
          const pts = award.get(team.id) ?? 0
          for (const tp of team.players) playerPoints.set(tp.playerId, (playerPoints.get(tp.playerId) ?? 0) + pts)
        }
      } else {
        // Fewer than 3 tournament teams — fall back to win/draw per match
        for (const match of tournamentMatches) {
          const hPlayers = match.homeTeam.players.map((p) => p.playerId)
          const aPlayers = match.awayTeam.players.map((p) => p.playerId)
          if (match.homeScore > match.awayScore) { hPlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 3)) }
          else if (match.homeScore < match.awayScore) { aPlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 3)) }
          else { hPlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 1)); aPlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 1)) }
        }
      }
    }

    // Normal match points (win=3, draw=1)
    if ((pointsScope === "all" || pointsScope === "normal") && normalMatches.length > 0) {
      for (const match of normalMatches) {
        const hPlayers = match.homeTeam.players.map((p) => p.playerId)
        const aPlayers = match.awayTeam.players.map((p) => p.playerId)
        if (match.homeScore > match.awayScore) { hPlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 3)) }
        else if (match.homeScore < match.awayScore) { aPlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 3)) }
        else { hPlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 1)); aPlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 1)) }
      }
    }
  }

  // Collect all player IDs from all teams
  const allPlayerIds = new Set<string>()
  for (const team of session.teams) {
    for (const tp of team.players) allPlayerIds.add(tp.playerId)
  }

  for (const playerId of allPlayerIds) {
    const goals = playerGoals.get(playerId) ?? 0
    const assists = playerAssists.get(playerId) ?? 0
    const points = playerPoints.get(playerId) ?? 0
    const matchesPlayed = playerMatchCount.get(playerId) ?? 0
    const score = goals + assists

    await db.playerStats.upsert({
      where: { playerId_seasonId: { playerId, seasonId: session.seasonId } },
      create: { playerId, seasonId: session.seasonId, sessionsPlayed: 1, matchesPlayed, goals, assists, score, points },
      update: {
        sessionsPlayed: { increment: 1 },
        matchesPlayed: { increment: matchesPlayed },
        goals: { increment: goals },
        assists: { increment: assists },
        score: { increment: score },
        points: { increment: points },
      },
    })

    await db.playerStatsLifetime.upsert({
      where: { playerId },
      create: { playerId, sessionsPlayed: 1, matchesPlayed, goals, assists, score, points },
      update: {
        sessionsPlayed: { increment: 1 },
        matchesPlayed: { increment: matchesPlayed },
        goals: { increment: goals },
        assists: { increment: assists },
        score: { increment: score },
        points: { increment: points },
      },
    })
  }
}
