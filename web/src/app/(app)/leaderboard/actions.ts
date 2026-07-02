"use server"

import { db } from "@/lib/db"

export async function getSeasonStats(seasonId: string) {
  const stats = await db.playerStats.findMany({
    where: { seasonId },
    include: { player: { select: { id: true, firstName: true, lastName: true, nickname: true } } },
  })

  return stats.map((s) => ({
    playerId: s.playerId,
    playerName: s.player.nickname
      ? `${s.player.firstName} ${s.player.lastName} (${s.player.nickname})`
      : `${s.player.firstName} ${s.player.lastName}`,
    sessionsPlayed: s.sessionsPlayed,
    matchesPlayed: s.matchesPlayed,
    goals: s.goals,
    assists: s.assists,
    score: s.score,
    points: s.points,
    seasonId: s.seasonId,
  }))
}

export async function getAggregatedStats(seasonIds: string[]) {
  const stats = await db.playerStats.findMany({
    where: seasonIds.length > 0 ? { seasonId: { in: seasonIds } } : {},
    include: { player: { select: { id: true, firstName: true, lastName: true, nickname: true } } },
  })

  const map = new Map<string, {
    playerId: string; playerName: string
    sessionsPlayed: number; matchesPlayed: number; goals: number; assists: number; score: number; points: number
  }>()

  for (const s of stats) {
    const playerName = s.player.nickname
      ? `${s.player.firstName} ${s.player.lastName} (${s.player.nickname})`
      : `${s.player.firstName} ${s.player.lastName}`
    const existing = map.get(s.playerId)
    if (existing) {
      existing.sessionsPlayed += s.sessionsPlayed
      existing.matchesPlayed += s.matchesPlayed
      existing.goals += s.goals
      existing.assists += s.assists
      existing.score += s.score
      existing.points += s.points
    } else {
      map.set(s.playerId, {
        playerId: s.playerId, playerName,
        sessionsPlayed: s.sessionsPlayed, matchesPlayed: s.matchesPlayed,
        goals: s.goals, assists: s.assists, score: s.score, points: s.points,
      })
    }
  }

  return [...map.values()]
}
