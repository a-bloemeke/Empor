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
