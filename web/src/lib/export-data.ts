import { db } from "@/lib/db"

// ─── Human-readable, ID-free export shape ────────────────────────────────────

export type ExportPlayer = {
  email: string
  firstName: string
  lastName: string
  nickname: string | null
  dateOfBirth: string | null
  addressStreet: string | null
  addressCity: string | null
  addressPostalCode: string | null
  role: string
}

export type ExportSeason = {
  year: number
  status: string
}

export type ExportSession = {
  seasonYear: number
  date: string          // ISO datetime
  status: string
  organizerEmail: string
}

export type ExportRegistration = {
  sessionDate: string
  playerEmail: string
  status: string
  registeredAt: string
  cancelledAt: string | null
  registeredByEmail: string
}

export type ExportTeam = {
  sessionDate: string
  name: string
  playerEmails: string[]
}

export type ExportMatch = {
  sessionDate: string
  roundNumber: number | null
  homeTeam: string      // team name
  awayTeam: string
  homeScore: number
  awayScore: number
  status: string
  endCondition: string | null
  startedAt: string | null
  endedAt: string | null
}

export type ExportGoal = {
  sessionDate: string
  roundNumber: number | null
  homeTeam: string
  awayTeam: string
  scorerEmail: string
  assisterEmail: string | null
  teamName: string
  scoredAt: string
}

export type ExportFee = {
  playerEmail: string
  year: number
  status: string
  paidAt: string | null
  recordedByEmail: string
}

export type ExportSeasonStat = {
  playerEmail: string
  seasonYear: number
  sessionsPlayed: number
  matchesPlayed: number
  goals: number
  assists: number
  score: number
  points: number
}

export type ExportLifetimeStat = {
  playerEmail: string
  sessionsPlayed: number
  matchesPlayed: number
  goals: number
  assists: number
  score: number
  points: number
}

export type ExportBundle = {
  exportedAt: string
  version: number
  scope: "all" | "season"
  seasonYear?: number
  players: ExportPlayer[]
  seasons: ExportSeason[]
  sessions: ExportSession[]
  registrations: ExportRegistration[]
  teams: ExportTeam[]
  matches: ExportMatch[]
  goals: ExportGoal[]
  fees: ExportFee[]
  seasonStats: ExportSeasonStat[]
  lifetimeStats?: ExportLifetimeStat[]   // only in full export
}

// ─── Filter a full bundle down to a single season ────────────────────────────

export function filterBundleToSeason(data: ExportBundle, year: number): ExportBundle {
  // Coerce to number defensively — JSON parse should give numbers, but guard against string coercion
  const season = data.seasons.find((s) => Number(s.year) === year)
  if (!season) {
    const available = data.seasons.map((s) => s.year).join(", ") || "none"
    throw new Error(`Season ${year} not found in the imported file. Available: ${available}`)
  }

  const sessionDates = new Set(
    data.sessions.filter((s) => Number(s.seasonYear) === year).map((s) => s.date)
  )

  return {
    exportedAt: data.exportedAt,
    version: data.version,
    scope: "season",
    seasonYear: year,
    players: data.players,
    seasons: [season],
    sessions:      data.sessions.filter((s) => Number(s.seasonYear) === year),
    registrations: data.registrations.filter((r) => sessionDates.has(r.sessionDate)),
    teams:         data.teams.filter((t) => sessionDates.has(t.sessionDate)),
    matches:       data.matches.filter((m) => sessionDates.has(m.sessionDate)),
    goals:         data.goals.filter((g) => sessionDates.has(g.sessionDate)),
    fees:          data.fees.filter((f) => Number(f.year) === year),
    seasonStats:   data.seasonStats.filter((s) => Number(s.seasonYear) === year),
    // lifetime stats intentionally omitted — season import never touches them
  }
}

// ─── Fetch and transform ──────────────────────────────────────────────────────

export async function buildExport(seasonId?: string): Promise<ExportBundle> {
  const players = await db.player.findMany({ omit: { passwordHash: true } })
  const emailById = new Map(players.map((p) => [p.id, p.email]))

  const seasons = await db.season.findMany({ orderBy: { year: "asc" } })
  const yearById = new Map(seasons.map((s) => [s.id, s.year]))
  const idByYear = new Map(seasons.map((s) => [s.year, s.id]))

  const sessionWhere = seasonId ? { seasonId } : {}
  const sessions = await db.session.findMany({
    where: sessionWhere,
    include: {
      teams: { include: { players: true } },
      matches: { include: { goals: true } },
      registrations: true,
    },
    orderBy: { date: "asc" },
  })

  const sessionDateById = new Map(sessions.map((s) => [s.id, s.date.toISOString()]))

  const fees = await db.membershipFee.findMany(
    seasonId
      ? { where: { year: yearById.get(seasons.find((s) => s.id === seasonId)!.id)! } }
      : undefined
  )

  const seasonStatsWhere = seasonId ? { seasonId } : {}
  const seasonStats = await db.playerStats.findMany({ where: seasonStatsWhere })
  const lifetimeStats = seasonId ? null : await db.playerStatsLifetime.findMany()

  // ── transform ──

  const exportPlayers: ExportPlayer[] = players.map((p) => ({
    email: p.email,
    firstName: p.firstName,
    lastName: p.lastName,
    nickname: p.nickname,
    dateOfBirth: p.dateOfBirth?.toISOString() ?? null,
    addressStreet: p.addressStreet,
    addressCity: p.addressCity,
    addressPostalCode: p.addressPostalCode,
    role: p.role,
  }))

  const exportSeasons: ExportSeason[] = (seasonId ? seasons.filter((s) => s.id === seasonId) : seasons)
    .map((s) => ({ year: s.year, status: s.status }))

  const exportSessions: ExportSession[] = sessions.map((s) => ({
    seasonYear: yearById.get(s.seasonId)!,
    date: s.date.toISOString(),
    status: s.status,
    organizerEmail: emailById.get(s.organizerId)!,
  }))

  const exportRegistrations: ExportRegistration[] = sessions.flatMap((s) =>
    s.registrations.map((r) => ({
      sessionDate: s.date.toISOString(),
      playerEmail: emailById.get(r.playerId)!,
      status: r.status,
      registeredAt: r.registeredAt.toISOString(),
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      registeredByEmail: emailById.get(r.registeredById)!,
    }))
  )

  const exportTeams: ExportTeam[] = sessions.flatMap((s) =>
    s.teams.map((t) => ({
      sessionDate: s.date.toISOString(),
      name: t.name,
      playerEmails: t.players.map((tp) => emailById.get(tp.playerId)!),
    }))
  )

  const teamNameById = new Map(
    sessions.flatMap((s) => s.teams.map((t) => [t.id, t.name]))
  )

  const exportMatches: ExportMatch[] = sessions.flatMap((s) =>
    s.matches.map((m) => ({
      sessionDate: s.date.toISOString(),
      roundNumber: m.roundNumber,
      homeTeam: teamNameById.get(m.homeTeamId)!,
      awayTeam: teamNameById.get(m.awayTeamId)!,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
      endCondition: m.endCondition,
      startedAt: m.startedAt?.toISOString() ?? null,
      endedAt: m.endedAt?.toISOString() ?? null,
    }))
  )

  const exportGoals: ExportGoal[] = sessions.flatMap((s) =>
    s.matches.flatMap((m) =>
      m.goals.map((g) => ({
        sessionDate: s.date.toISOString(),
        roundNumber: m.roundNumber,
        homeTeam: teamNameById.get(m.homeTeamId)!,
        awayTeam: teamNameById.get(m.awayTeamId)!,
        scorerEmail: emailById.get(g.scoredByPlayerId)!,
        assisterEmail: g.assistedByPlayerId ? (emailById.get(g.assistedByPlayerId) ?? null) : null,
        teamName: teamNameById.get(g.teamId)!,
        scoredAt: g.scoredAt.toISOString(),
      }))
    )
  )

  const exportFees: ExportFee[] = fees.map((f) => ({
    playerEmail: emailById.get(f.playerId)!,
    year: f.year,
    status: f.status,
    paidAt: f.paidAt?.toISOString() ?? null,
    recordedByEmail: emailById.get(f.recordedById)!,
  }))

  const exportSeasonStats: ExportSeasonStat[] = seasonStats.map((s) => ({
    playerEmail: emailById.get(s.playerId)!,
    seasonYear: yearById.get(s.seasonId)!,
    sessionsPlayed: s.sessionsPlayed,
    matchesPlayed: s.matchesPlayed,
    goals: s.goals,
    assists: s.assists,
    score: s.score,
    points: s.points,
  }))

  const exportLifetimeStats: ExportLifetimeStat[] | undefined = lifetimeStats?.map((s) => ({
    playerEmail: emailById.get(s.playerId)!,
    sessionsPlayed: s.sessionsPlayed,
    matchesPlayed: s.matchesPlayed,
    goals: s.goals,
    assists: s.assists,
    score: s.score,
    points: s.points,
  }))

  const targetSeason = seasonId ? seasons.find((s) => s.id === seasonId) : undefined

  return {
    exportedAt: new Date().toISOString(),
    version: 2,
    scope: seasonId ? "season" : "all",
    ...(targetSeason ? { seasonYear: targetSeason.year } : {}),
    players: exportPlayers,
    seasons: exportSeasons,
    sessions: exportSessions,
    registrations: exportRegistrations,
    teams: exportTeams,
    matches: exportMatches,
    goals: exportGoals,
    fees: exportFees,
    seasonStats: exportSeasonStats,
    ...(exportLifetimeStats ? { lifetimeStats: exportLifetimeStats } : {}),
  }
}

// ─── Import: rebuild from natural keys, generate fresh IDs ───────────────────

export async function importBundle(data: ExportBundle) {
  if (data.version !== 2) throw new Error("Unsupported export version. Only version 2 is supported.")

  await db.$transaction(async (tx) => {
    // ── Wipe scope ──
    if (data.scope === "all") {
      await tx.playerStatsLifetime.deleteMany()
      await tx.playerStats.deleteMany()
      await tx.membershipFee.deleteMany()
      await tx.goal.deleteMany()
      await tx.match.deleteMany()
      await tx.teamPlayer.deleteMany()
      await tx.team.deleteMany()
      await tx.sessionRegistration.deleteMany()
      await tx.session.deleteMany()
      await tx.season.deleteMany()
    } else {
      // Season-scoped: only wipe data for this season year
      const existingSeason = await tx.season.findUnique({ where: { year: Number(data.seasonYear!) } })
      if (existingSeason) {
        const sessionsInSeason = await tx.session.findMany({ where: { seasonId: existingSeason.id } })
        const sessionIds = sessionsInSeason.map((s) => s.id)
        const matchesInSeason = await tx.match.findMany({ where: { sessionId: { in: sessionIds } } })
        const matchIds = matchesInSeason.map((m) => m.id)
        await tx.goal.deleteMany({ where: { matchId: { in: matchIds } } })
        await tx.match.deleteMany({ where: { id: { in: matchIds } } })
        const teamIds = (await tx.team.findMany({ where: { sessionId: { in: sessionIds } } })).map((t) => t.id)
        await tx.teamPlayer.deleteMany({ where: { teamId: { in: teamIds } } })
        await tx.team.deleteMany({ where: { id: { in: teamIds } } })
        await tx.sessionRegistration.deleteMany({ where: { sessionId: { in: sessionIds } } })
        await tx.session.deleteMany({ where: { id: { in: sessionIds } } })
        await tx.playerStats.deleteMany({ where: { seasonId: existingSeason.id } })
        await tx.membershipFee.deleteMany({ where: { year: data.seasonYear! } })
        await tx.season.delete({ where: { id: existingSeason.id } })
      }
    }

    // ── Players: upsert by email ──
    const playerIdByEmail = new Map<string, string>()
    for (const p of data.players ?? []) {
      const row = await tx.player.upsert({
        where: { email: p.email },
        update: {
          firstName: p.firstName, lastName: p.lastName, nickname: p.nickname ?? null,
          dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth) : null,
          addressStreet: p.addressStreet ?? null, addressCity: p.addressCity ?? null,
          addressPostalCode: p.addressPostalCode ?? null, role: p.role as any,
        },
        create: {
          email: p.email, firstName: p.firstName, lastName: p.lastName,
          nickname: p.nickname ?? null,
          dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth) : null,
          addressStreet: p.addressStreet ?? null, addressCity: p.addressCity ?? null,
          addressPostalCode: p.addressPostalCode ?? null, role: p.role as any,
        },
      })
      playerIdByEmail.set(p.email, row.id)
    }

    // ── Seasons: upsert by year ──
    const seasonIdByYear = new Map<number, string>()
    for (const s of data.seasons ?? []) {
      const year = Number(s.year)
      const row = await tx.season.upsert({
        where: { year },
        update: { status: s.status as any },
        create: { year, status: s.status as any },
      })
      seasonIdByYear.set(year, row.id)
    }

    // ── Sessions: create (natural key = seasonYear + date) ──
    const sessionIdByDate = new Map<string, string>()
    for (const s of data.sessions ?? []) {
      const seasonId = seasonIdByYear.get(Number(s.seasonYear))!
      const organizerId = playerIdByEmail.get(s.organizerEmail)!
      const row = await tx.session.create({
        data: { seasonId, date: new Date(s.date), status: s.status as any, organizerId },
      })
      sessionIdByDate.set(s.date, row.id)
    }

    // ── Registrations ──
    for (const r of data.registrations ?? []) {
      const sessionId = sessionIdByDate.get(r.sessionDate)
      const playerId = playerIdByEmail.get(r.playerEmail)
      const registeredById = playerIdByEmail.get(r.registeredByEmail)
      if (!sessionId || !playerId || !registeredById) continue
      await tx.sessionRegistration.create({
        data: {
          sessionId, playerId, registeredById,
          status: r.status as any,
          registeredAt: new Date(r.registeredAt),
          cancelledAt: r.cancelledAt ? new Date(r.cancelledAt) : null,
        },
      })
    }

    // ── Teams ──
    const teamIdByKey = new Map<string, string>() // `${sessionDate}:${teamName}` → id
    for (const t of data.teams ?? []) {
      const sessionId = sessionIdByDate.get(t.sessionDate)
      if (!sessionId) continue
      const row = await tx.team.create({ data: { sessionId, name: t.name } })
      teamIdByKey.set(`${t.sessionDate}:${t.name}`, row.id)
      for (const email of t.playerEmails) {
        const playerId = playerIdByEmail.get(email)
        if (playerId) await tx.teamPlayer.create({ data: { teamId: row.id, playerId } })
      }
    }

    // ── Matches ──
    const matchIdByKey = new Map<string, string>() // `${sessionDate}:${round}:${home}:${away}` → id
    for (const m of data.matches ?? []) {
      const sessionId = sessionIdByDate.get(m.sessionDate)
      const homeTeamId = teamIdByKey.get(`${m.sessionDate}:${m.homeTeam}`)
      const awayTeamId = teamIdByKey.get(`${m.sessionDate}:${m.awayTeam}`)
      if (!sessionId || !homeTeamId || !awayTeamId) continue
      const row = await tx.match.create({
        data: {
          sessionId, homeTeamId, awayTeamId,
          roundNumber: m.roundNumber != null ? Number(m.roundNumber) : null,
          homeScore: Number(m.homeScore), awayScore: Number(m.awayScore),
          status: m.status as any,
          endCondition: m.endCondition as any ?? null,
          startedAt: m.startedAt ? new Date(m.startedAt) : null,
          endedAt: m.endedAt ? new Date(m.endedAt) : null,
        },
      })
      const key = `${m.sessionDate}:${m.roundNumber ?? ""}:${m.homeTeam}:${m.awayTeam}`
      matchIdByKey.set(key, row.id)
    }

    // ── Goals ──
    for (const g of data.goals ?? []) {
      const key = `${g.sessionDate}:${g.roundNumber ?? ""}:${g.homeTeam}:${g.awayTeam}`
      const matchId = matchIdByKey.get(key)
      const scoredByPlayerId = playerIdByEmail.get(g.scorerEmail)
      const teamId = teamIdByKey.get(`${g.sessionDate}:${g.teamName}`)
      if (!matchId || !scoredByPlayerId || !teamId) continue
      await tx.goal.create({
        data: {
          matchId, scoredByPlayerId, teamId,
          assistedByPlayerId: g.assisterEmail ? (playerIdByEmail.get(g.assisterEmail) ?? null) : null,
          scoredAt: new Date(g.scoredAt),
        },
      })
    }

    // ── Fees ──
    for (const f of data.fees ?? []) {
      const playerId = playerIdByEmail.get(f.playerEmail)
      const recordedById = playerIdByEmail.get(f.recordedByEmail)
      if (!playerId || !recordedById) continue
      const year = Number(f.year)
      await tx.membershipFee.upsert({
        where: { playerId_year: { playerId, year } },
        update: { status: f.status as any, paidAt: f.paidAt ? new Date(f.paidAt) : null, recordedById },
        create: { playerId, year, status: f.status as any, paidAt: f.paidAt ? new Date(f.paidAt) : null, recordedById },
      })
    }

    // ── Season stats ──
    for (const s of data.seasonStats ?? []) {
      const playerId = playerIdByEmail.get(s.playerEmail)
      const seasonId = seasonIdByYear.get(Number(s.seasonYear))
      if (!playerId || !seasonId) continue
      await tx.playerStats.upsert({
        where: { playerId_seasonId: { playerId, seasonId } },
        update: { sessionsPlayed: Number(s.sessionsPlayed), matchesPlayed: Number(s.matchesPlayed), goals: Number(s.goals), assists: Number(s.assists), score: Number(s.score), points: Number(s.points) },
        create: { playerId, seasonId, sessionsPlayed: Number(s.sessionsPlayed), matchesPlayed: Number(s.matchesPlayed), goals: Number(s.goals), assists: Number(s.assists), score: Number(s.score), points: Number(s.points) },
      })
    }

    // ── Lifetime stats (only in full export) ──
    for (const s of data.lifetimeStats ?? []) {
      const playerId = playerIdByEmail.get(s.playerEmail)
      if (!playerId) continue
      await tx.playerStatsLifetime.upsert({
        where: { playerId },
        update: { sessionsPlayed: Number(s.sessionsPlayed), matchesPlayed: Number(s.matchesPlayed), goals: Number(s.goals), assists: Number(s.assists), score: Number(s.score), points: Number(s.points) },
        create: { playerId, sessionsPlayed: Number(s.sessionsPlayed), matchesPlayed: Number(s.matchesPlayed), goals: Number(s.goals), assists: Number(s.assists), score: Number(s.score), points: Number(s.points) },
      })
    }
  }, { timeout: 30000 })
}
