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
  maxPlayers: number | null
}

export type ExportRegistration = {
  sessionDate: string
  playerEmail: string
  status: string
  registeredAt: string
  cancelledAt: string | null
  beerBringer: boolean
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
  beers: number
}

export type ExportLifetimeStat = {
  playerEmail: string
  sessionsPlayed: number
  matchesPlayed: number
  goals: number
  assists: number
  score: number
  points: number
  beers: number
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
    maxPlayers: s.maxPlayers ?? null,
  }))

  const exportRegistrations: ExportRegistration[] = sessions.flatMap((s) =>
    s.registrations.map((r) => ({
      sessionDate: s.date.toISOString(),
      playerEmail: emailById.get(r.playerId)!,
      status: r.status,
      registeredAt: r.registeredAt.toISOString(),
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      beerBringer: r.beerBringer,
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
    beers: s.beers,
  }))

  const exportLifetimeStats: ExportLifetimeStat[] | undefined = lifetimeStats?.map((s) => ({
    playerEmail: emailById.get(s.playerId)!,
    sessionsPlayed: s.sessionsPlayed,
    matchesPlayed: s.matchesPlayed,
    goals: s.goals,
    assists: s.assists,
    score: s.score,
    points: s.points,
    beers: s.beers,
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

export async function importBundle(data: ExportBundle, mode: "replace" | "merge" = "replace") {
  if (data.version !== 2) throw new Error("Unsupported export version. Only version 2 is supported.")

  // ── Wipe phase — skipped entirely in merge mode ──
  if (mode === "replace") {
  if (data.scope === "all") {
    await db.playerStatsLifetime.deleteMany()
    await db.playerStats.deleteMany()
    await db.membershipFee.deleteMany()
    await db.goal.deleteMany()
    await db.match.deleteMany()
    await db.teamPlayer.deleteMany()
    await db.team.deleteMany()
    await db.sessionRegistration.deleteMany()
    await db.session.deleteMany()
    await db.season.deleteMany()
  } else {
    const existingSeason = await db.season.findUnique({ where: { year: Number(data.seasonYear!) } })
    if (existingSeason) {
      const sessionIds = (await db.session.findMany({ where: { seasonId: existingSeason.id }, select: { id: true } })).map((s) => s.id)
      const matchIds = (await db.match.findMany({ where: { sessionId: { in: sessionIds } }, select: { id: true } })).map((m) => m.id)
      const teamIds = (await db.team.findMany({ where: { sessionId: { in: sessionIds } }, select: { id: true } })).map((t) => t.id)
      await db.goal.deleteMany({ where: { matchId: { in: matchIds } } })
      await db.match.deleteMany({ where: { id: { in: matchIds } } })
      await db.teamPlayer.deleteMany({ where: { teamId: { in: teamIds } } })
      await db.team.deleteMany({ where: { id: { in: teamIds } } })
      await db.sessionRegistration.deleteMany({ where: { sessionId: { in: sessionIds } } })
      await db.session.deleteMany({ where: { id: { in: sessionIds } } })
      await db.playerStats.deleteMany({ where: { seasonId: existingSeason.id } })
      await db.membershipFee.deleteMany({ where: { year: data.seasonYear! } })
      await db.season.delete({ where: { id: existingSeason.id } })
    }
  }
  } // end replace-only wipe

  // ── Restore/merge phase ──
  // Players: upsert — in merge mode, only create if not existing (no update)
  const playerIdByEmail = new Map<string, string>()
  for (const p of data.players ?? []) {
    const row = await db.player.upsert({
      where: { email: p.email },
      update: mode === "replace" ? {
        firstName: p.firstName, lastName: p.lastName, nickname: p.nickname ?? null,
        dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth) : null,
        addressStreet: p.addressStreet ?? null, addressCity: p.addressCity ?? null,
        addressPostalCode: p.addressPostalCode ?? null, role: p.role as any,
      } : {}, // merge: don't overwrite existing player data
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

  // Seasons: upsert individually (need ID map)
  const seasonIdByYear = new Map<number, string>()
  for (const s of data.seasons ?? []) {
    const year = Number(s.year)
    const row = await db.season.upsert({
      where: { year },
      update: { status: s.status as any },
      create: { year, status: s.status as any },
    })
    seasonIdByYear.set(year, row.id)
  }

  // Sessions: upsert by date (merge skips existing, replace always creates fresh after wipe)
  const sessionIdByDate = new Map<string, string>()
  for (const s of data.sessions ?? []) {
    const seasonId = seasonIdByYear.get(Number(s.seasonYear))!
    const organizerId = playerIdByEmail.get(s.organizerEmail)!
    if (mode === "merge") {
      // Check if session already exists by date+seasonId
      const existing = await db.session.findFirst({ where: { seasonId, date: new Date(s.date) } })
      if (existing) { sessionIdByDate.set(s.date, existing.id); continue }
    }
    const row = await db.session.create({
      data: { seasonId, date: new Date(s.date), status: s.status as any, organizerId, maxPlayers: s.maxPlayers ?? 12 },
    })
    sessionIdByDate.set(s.date, row.id)
  }

  // Registrations: skip duplicates in both modes (safe to always use skipDuplicates)
  const registrationData = (data.registrations ?? []).flatMap((r) => {
    const sessionId = sessionIdByDate.get(r.sessionDate)
    const playerId = playerIdByEmail.get(r.playerEmail)
    const registeredById = playerIdByEmail.get(r.registeredByEmail)
    if (!sessionId || !playerId || !registeredById) return []
    return [{
      sessionId, playerId, registeredById,
      status: r.status as any,
      registeredAt: new Date(r.registeredAt),
      cancelledAt: r.cancelledAt ? new Date(r.cancelledAt) : null,
      beerBringer: r.beerBringer === true || String(r.beerBringer) === "true",
    }]
  })
  if (registrationData.length) await db.sessionRegistration.createMany({ data: registrationData, skipDuplicates: true })

  // Teams: create individually (need ID map), then bulk create TeamPlayers
  const teamIdByKey = new Map<string, string>()
  const teamPlayerData: { teamId: string; playerId: string }[] = []
  for (const t of data.teams ?? []) {
    const sessionId = sessionIdByDate.get(t.sessionDate)
    if (!sessionId) continue
    // In merge mode, skip teams that already exist for this session
    if (mode === "merge") {
      const existing = await db.team.findFirst({ where: { sessionId, name: t.name } })
      if (existing) { teamIdByKey.set(`${t.sessionDate}:${t.name}`, existing.id); continue }
    }
    const row = await db.team.create({ data: { sessionId, name: t.name } })
    teamIdByKey.set(`${t.sessionDate}:${t.name}`, row.id)
    for (const email of t.playerEmails) {
      const playerId = playerIdByEmail.get(email)
      if (playerId) teamPlayerData.push({ teamId: row.id, playerId })
    }
  }
  if (teamPlayerData.length) await db.teamPlayer.createMany({ data: teamPlayerData, skipDuplicates: true })

  // Matches: bulk create (need ID map — create individually but collect in parallel batches)
  const matchIdByKey = new Map<string, string>()
  const matchRows = await Promise.all((data.matches ?? []).map(async (m) => {
    const sessionId = sessionIdByDate.get(m.sessionDate)
    const homeTeamId = teamIdByKey.get(`${m.sessionDate}:${m.homeTeam}`)
    const awayTeamId = teamIdByKey.get(`${m.sessionDate}:${m.awayTeam}`)
    if (!sessionId || !homeTeamId || !awayTeamId) return null
    const row = await db.match.create({
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
    return { key: `${m.sessionDate}:${m.roundNumber ?? ""}:${m.homeTeam}:${m.awayTeam}`, id: row.id }
  }))
  for (const r of matchRows) if (r) matchIdByKey.set(r.key, r.id)

  // Goals: bulk create
  const goalData = (data.goals ?? []).flatMap((g) => {
    const key = `${g.sessionDate}:${g.roundNumber ?? ""}:${g.homeTeam}:${g.awayTeam}`
    const matchId = matchIdByKey.get(key)
    const scoredByPlayerId = playerIdByEmail.get(g.scorerEmail)
    const teamId = teamIdByKey.get(`${g.sessionDate}:${g.teamName}`)
    if (!matchId || !scoredByPlayerId || !teamId) return []
    return [{
      matchId, scoredByPlayerId, teamId,
      assistedByPlayerId: g.assisterEmail ? (playerIdByEmail.get(g.assisterEmail) ?? null) : null,
      scoredAt: new Date(g.scoredAt),
    }]
  })
  if (goalData.length) await db.goal.createMany({ data: goalData, skipDuplicates: true })

  // Fees: skip duplicates (don't overwrite existing fee records in merge)
  const feeData = (data.fees ?? []).flatMap((f) => {
    const playerId = playerIdByEmail.get(f.playerEmail)
    const recordedById = playerIdByEmail.get(f.recordedByEmail)
    if (!playerId || !recordedById) return []
    return [{ playerId, year: Number(f.year), status: f.status as any, paidAt: f.paidAt ? new Date(f.paidAt) : null, recordedById }]
  })
  if (feeData.length) await db.membershipFee.createMany({ data: feeData, skipDuplicates: true })

  // Season stats
  for (const s of data.seasonStats ?? []) {
    const playerId = playerIdByEmail.get(s.playerEmail)
    const seasonId = seasonIdByYear.get(Number(s.seasonYear))
    if (!playerId || !seasonId) continue
    const vals = { sessionsPlayed: Number(s.sessionsPlayed), matchesPlayed: Number(s.matchesPlayed), goals: Number(s.goals), assists: Number(s.assists), score: Number(s.score), points: Number(s.points), beers: Number(s.beers ?? 0) }
    if (mode === "merge") {
      // Add imported values on top of whatever is already in DB
      await db.playerStats.upsert({
        where: { playerId_seasonId: { playerId, seasonId } },
        create: { playerId, seasonId, ...vals },
        update: { sessionsPlayed: { increment: vals.sessionsPlayed }, matchesPlayed: { increment: vals.matchesPlayed }, goals: { increment: vals.goals }, assists: { increment: vals.assists }, score: { increment: vals.score }, points: { increment: vals.points }, beers: { increment: vals.beers } },
      })
    } else {
      await db.playerStats.upsert({
        where: { playerId_seasonId: { playerId, seasonId } },
        create: { playerId, seasonId, ...vals },
        update: vals,
      })
    }
  }

  // Lifetime stats
  for (const s of data.lifetimeStats ?? []) {
    const playerId = playerIdByEmail.get(s.playerEmail)
    if (!playerId) continue
    const vals = { sessionsPlayed: Number(s.sessionsPlayed), matchesPlayed: Number(s.matchesPlayed), goals: Number(s.goals), assists: Number(s.assists), score: Number(s.score), points: Number(s.points), beers: Number(s.beers ?? 0) }
    if (mode === "merge") {
      await db.playerStatsLifetime.upsert({
        where: { playerId },
        create: { playerId, ...vals },
        update: { sessionsPlayed: { increment: vals.sessionsPlayed }, matchesPlayed: { increment: vals.matchesPlayed }, goals: { increment: vals.goals }, assists: { increment: vals.assists }, score: { increment: vals.score }, points: { increment: vals.points }, beers: { increment: vals.beers } },
      })
    } else {
      await db.playerStatsLifetime.upsert({
        where: { playerId },
        create: { playerId, ...vals },
        update: vals,
      })
    }
  }
}
