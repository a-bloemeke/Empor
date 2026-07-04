"use server"

import { db } from "@/lib/db"
import { buildPlayerNames } from "@/lib/player-names"

async function getAllPlayerNames() {
  const all = await db.player.findMany({
    where: { passwordHash: { not: null } },
    select: { id: true, firstName: true, lastName: true, nickname: true },
  })
  return buildPlayerNames(all)
}

export async function getSeasonStats(seasonId: string) {
  const [stats, displayNames] = await Promise.all([
    db.playerStats.findMany({
      where: { seasonId },
      include: { player: { select: { id: true, firstName: true, lastName: true, nickname: true } } },
    }),
    getAllPlayerNames(),
  ])

  return stats.map((s) => ({
    playerId: s.playerId,
    playerName: displayNames.get(s.playerId) ?? s.player.firstName,
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
  if (seasonIds.length === 0) return []

  const [stats, displayNames] = await Promise.all([
    db.playerStats.findMany({
      where: { seasonId: { in: seasonIds } },
      include: { player: { select: { id: true, firstName: true, lastName: true, nickname: true } } },
    }),
    getAllPlayerNames(),
  ])

  const map = new Map<string, {
    playerId: string; playerName: string
    sessionsPlayed: number; matchesPlayed: number; goals: number; assists: number; score: number; points: number
  }>()

  for (const s of stats) {
    const playerName = displayNames.get(s.playerId) ?? s.player.firstName
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
