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
    const matchPoints = playerPoints.get(playerId) ?? 0
    const matchesPlayed = playerMatchCount.get(playerId) ?? 0
    const score = goals + assists
    // +1 participation point for showing up, on top of match/tournament outcome points
    const points = matchPoints + 1

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

  // Response speed points — rank REGISTERED players by registeredAt, award N to 1 pts
  const registeredRegs = await db.sessionRegistration.findMany({
    where: { sessionId, status: "REGISTERED" },
    select: { playerId: true },
    orderBy: { registeredAt: "asc" },
  })
  const regCount = registeredRegs.length
  for (let i = 0; i < regCount; i++) {
    const rp = registeredRegs[i].playerId
    const rpts = regCount - i
    await db.playerStats.upsert({
      where: { playerId_seasonId: { playerId: rp, seasonId: session.seasonId } },
      create: { playerId: rp, seasonId: session.seasonId, sessionsPlayed: 0, responsePoints: rpts },
      update: { responsePoints: { increment: rpts } },
    })
    await db.playerStatsLifetime.upsert({
      where: { playerId: rp },
      create: { playerId: rp, responsePoints: rpts },
      update: { responsePoints: { increment: rpts } },
    })
  }

  // Increment beer counter for each player who brought beer, split equally
  const beerRegs = await db.sessionRegistration.findMany({
    where: { sessionId, beerBringer: true, status: "REGISTERED" },
    select: { playerId: true },
  })
  const N = beerRegs.length
  if (N > 0) {
    const credit = 1 / N
    for (const { playerId: beerPlayerId } of beerRegs) {
      await db.playerStats.upsert({
        where: { playerId_seasonId: { playerId: beerPlayerId, seasonId: session.seasonId } },
        create: { playerId: beerPlayerId, seasonId: session.seasonId, sessionsPlayed: 0, beers: credit },
        update: { beers: { increment: credit } },
      })
      await db.playerStatsLifetime.upsert({
        where: { playerId: beerPlayerId },
        create: { playerId: beerPlayerId, beers: credit },
        update: { beers: { increment: credit } },
      })
    }
  }
}

// Recomputes beer stats from scratch for the given players across all completed sessions.
// Use after admin toggles beer on an already-completed session, or as a global repair.
export async function rebuildBeerStatsForPlayers(playerIds: string[]) {
  for (const playerId of playerIds) {
    const beerRegs = await db.sessionRegistration.findMany({
      where: { playerId, beerBringer: true, status: "REGISTERED", session: { status: "COMPLETED" } },
      select: { sessionId: true, session: { select: { seasonId: true } } },
    })

    const seasonBeers = new Map<string, number>()
    let lifetimeBeers = 0

    for (const reg of beerRegs) {
      const bringerCount = await db.sessionRegistration.count({
        where: { sessionId: reg.sessionId, beerBringer: true, status: "REGISTERED" },
      })
      const credit = 1 / bringerCount
      lifetimeBeers += credit
      seasonBeers.set(reg.session.seasonId, (seasonBeers.get(reg.session.seasonId) ?? 0) + credit)
    }

    await db.playerStatsLifetime.upsert({
      where: { playerId },
      create: { playerId, beers: lifetimeBeers },
      update: { beers: lifetimeBeers },
    })

    for (const [seasonId, beers] of seasonBeers) {
      await db.playerStats.upsert({
        where: { playerId_seasonId: { playerId, seasonId } },
        create: { playerId, seasonId, sessionsPlayed: 0, beers },
        update: { beers },
      })
    }
  }
}

// Rebuilds beer stats for all players who have beerBringer=true registrations on completed sessions.
// Only touches players with registration-backed beer credit — does NOT zero out stats
// that were set via data import (historical data without registration records).
export async function rebuildAllBeerStats() {
  const allBeerRegs = await db.sessionRegistration.findMany({
    where: { beerBringer: true, status: "REGISTERED", session: { status: "COMPLETED" } },
    select: { playerId: true },
    distinct: ["playerId"],
  })
  const playerIds = allBeerRegs.map((r) => r.playerId)
  if (playerIds.length > 0) await rebuildBeerStatsForPlayers(playerIds)
}

// Recomputes response speed points from scratch for given players across all completed sessions.
export async function rebuildResponseStatsForPlayers(playerIds: string[]) {
  for (const playerId of playerIds) {
    const regs = await db.sessionRegistration.findMany({
      where: { playerId, status: "REGISTERED", session: { status: "COMPLETED" } },
      select: {
        registeredAt: true,
        sessionId: true,
        session: { select: { seasonId: true } },
      },
    })

    const seasonPoints = new Map<string, number>()
    let lifetimePoints = 0

    for (const reg of regs) {
      // Count total registered players in this session and find this player's rank
      const allInSession = await db.sessionRegistration.findMany({
        where: { sessionId: reg.sessionId, status: "REGISTERED" },
        select: { playerId: true, registeredAt: true },
        orderBy: { registeredAt: "asc" },
      })
      const total = allInSession.length
      const rank = allInSession.findIndex((r) => r.playerId === playerId)
      if (rank === -1) continue
      const pts = total - rank
      lifetimePoints += pts
      seasonPoints.set(reg.session.seasonId, (seasonPoints.get(reg.session.seasonId) ?? 0) + pts)
    }

    await db.playerStatsLifetime.upsert({
      where: { playerId },
      create: { playerId, responsePoints: lifetimePoints },
      update: { responsePoints: lifetimePoints },
    })

    for (const [seasonId, pts] of seasonPoints) {
      await db.playerStats.upsert({
        where: { playerId_seasonId: { playerId, seasonId } },
        create: { playerId, seasonId, sessionsPlayed: 0, responsePoints: pts },
        update: { responsePoints: pts },
      })
    }
  }
}

// Rebuilds response points for all players who have REGISTERED registrations on completed sessions.
export async function rebuildAllResponseStats() {
  const regs = await db.sessionRegistration.findMany({
    where: { status: "REGISTERED", session: { status: "COMPLETED" } },
    select: { playerId: true },
    distinct: ["playerId"],
  })
  const playerIds = regs.map((r) => r.playerId)
  if (playerIds.length > 0) await rebuildResponseStatsForPlayers(playerIds)
}
