"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { computeAndSaveStats } from "@/lib/stats"
import type { PointsScope } from "@/lib/types"
import { nextTeamNames, optimalPartition2, computePlayerDeltas } from "@/lib/game-logic"
import type { TeamRef, MatchRef } from "@/lib/game-logic"
import { sendGameDayInvitation, sendStatusUpdateEmail, buildDefaultInvitation } from "@/lib/email"
import { format } from "date-fns"
import { de } from "date-fns/locale"

export async function getDefaultInvitation(sessionId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({ where: { id: sessionId } })
  if (!session) throw new Error("Session not found.")

  const [defaults, players, usedQuotes] = await Promise.all([
    Promise.resolve(buildDefaultInvitation({ id: session.id, date: session.date })),
    db.player.findMany({
      where: { passwordHash: { not: null } },
      select: { id: true, firstName: true, lastName: true, email: true, emailNotifications: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.invitationQuote.findMany({
      orderBy: { usedAt: "desc" },
      take: 20,
      select: { quote: true, author: true, usedAt: true },
    }),
  ])

  return {
    ...defaults,
    players: players.map((p: { id: string; firstName: string; lastName: string; email: string; emailNotifications: boolean }) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      email: p.email,
      emailNotifications: p.emailNotifications,
    })),
    usedQuotes,
  }
}

export async function sendInvitation(
  sessionId: string,
  subject: string,
  body: string,
  recipientIds: string[],
  quote?: { text: string; author: string },
) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({ where: { id: sessionId } })
  if (!session) throw new Error("Session not found.")

  const players = await db.player.findMany({
    where: { id: { in: recipientIds }, passwordHash: { not: null } },
    select: { email: true },
  })
  const emails = players.map((p) => p.email).filter(Boolean) as string[]

  const count = await sendGameDayInvitation(
    { id: session.id, date: session.date },
    subject,
    body,
    emails,
    quote,
  )
  return count
}

// ─── Summary helpers ──────────────────────────────────────────────────────────

type SummarySession = {
  date: Date
  teams: {
    id: string
    name: string
    players: { playerId: string; player: { firstName: string; lastName: string; nickname: string | null } }[]
  }[]
  matches: {
    roundNumber: number | null
    homeTeamId: string
    awayTeamId: string
    homeScore: number
    awayScore: number
    status: string
    homeTeam: { name: string }
    awayTeam: { name: string }
    goals: { scoredByPlayerId: string; assistedByPlayerId: string | null }[]
  }[]
}

function buildSummaryText(session: SummarySession, dateStr: string): string {
  const teamRefs: TeamRef[] = session.teams.map((t) => ({
    id: t.id,
    playerIds: t.players.map((tp) => tp.playerId),
  }))

  const playersByTeamId = new Map(session.teams.map((t) => [t.id, t.players.map((tp) => tp.playerId)]))
  const completedMatches = session.matches.filter((m) => m.status === "COMPLETED")
  const matchRefs: MatchRef[] = completedMatches.map((m) => ({
    id: `${m.homeTeamId}-${m.awayTeamId}`,
    roundNumber: m.roundNumber,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    homePlayers: playersByTeamId.get(m.homeTeamId) ?? [],
    awayPlayers: playersByTeamId.get(m.awayTeamId) ?? [],
    goals: m.goals,
  }))

  const playerName = (tp: { player: { firstName: string; lastName: string; nickname: string | null } }) =>
    tp.player.nickname ?? tp.player.firstName

  const nameById = new Map(
    session.teams.flatMap((t) => t.players.map((tp) => [tp.playerId, playerName(tp)]))
  )

  const deltas = computePlayerDeltas(teamRefs, matchRefs, "all")
  const sorted = [...deltas].sort((a, b) => {
    const scoreA = a.goals + a.assists + a.points
    const scoreB = b.goals + b.assists + b.points
    if (scoreB !== scoreA) return scoreB - scoreA
    if (b.goals !== a.goals) return b.goals - a.goals
    return b.assists - a.assists
  })

  const lines: string[] = []
  lines.push(`Spieltag-Zusammenfassung — ${dateStr}`)
  lines.push("")

  lines.push("=== Ergebnisse ===")
  for (const m of completedMatches) {
    const prefix = m.roundNumber != null ? `Runde ${m.roundNumber}  ` : ""
    lines.push(`${prefix}${m.homeTeam.name} ${m.homeScore}:${m.awayScore} ${m.awayTeam.name}`)
  }
  lines.push("")

  lines.push("=== Spieler-Statistiken ===")
  sorted.forEach((row, i) => {
    const name = nameById.get(row.playerId) ?? row.playerId
    lines.push(`${i + 1}. ${name.padEnd(20)} ${row.goals}T  ${row.assists}V  ${row.goals + row.assists} Score  ${row.points} Pkt`)
  })
  lines.push("")

  if (sorted.length > 0 && (sorted[0].goals + sorted[0].assists + sorted[0].points) > 0) {
    const mvp = sorted[0]
    const mvpName = nameById.get(mvp.playerId) ?? mvp.playerId
    lines.push(`👑 MVP: ${mvpName} (${mvp.goals} Tore, ${mvp.assists} Vorlagen, ${mvp.points} Punkte)`)
    lines.push("")
  }

  lines.push("Empor Lichtenberg")
  return lines.join("\n")
}

export async function getSummaryEmailDefaults(sessionId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      teams: {
        include: {
          players: {
            include: { player: { select: { id: true, firstName: true, lastName: true, nickname: true } } },
          },
        },
      },
      matches: {
        where: { status: "COMPLETED" },
        include: {
          homeTeam: { select: { id: true, name: true } },
          awayTeam: { select: { id: true, name: true } },
          goals: { select: { scoredByPlayerId: true, assistedByPlayerId: true } },
        },
        orderBy: [{ roundNumber: "asc" }, { startedAt: "asc" }],
      },
    },
  })
  if (!session) throw new Error("Session not found.")

  const playerIdsOnTeam = new Set(session.teams.flatMap((t) => t.players.map((tp) => tp.playerId)))
  const players = await db.player.findMany({
    where: { id: { in: [...playerIdsOnTeam] }, passwordHash: { not: null } },
    select: { id: true, firstName: true, lastName: true, nickname: true, email: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })

  const dateStr = format(session.date, "EEEE, d. MMMM yyyy", { locale: de })
  const subject = `📊 Spieltag-Zusammenfassung – ${dateStr}`
  const body = buildSummaryText(session, dateStr)

  return {
    subject,
    body,
    players: players.map((p) => ({
      id: p.id,
      name: p.nickname
        ? `${p.firstName} ${p.lastName} (${p.nickname})`
        : `${p.firstName} ${p.lastName}`.trim(),
      email: p.email,
    })),
  }
}

export async function sendSummaryEmail(
  sessionId: string,
  subject: string,
  body: string,
  recipientIds: string[],
) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({ where: { id: sessionId } })
  if (!session) throw new Error("Session not found.")

  const players = await db.player.findMany({
    where: { id: { in: recipientIds }, passwordHash: { not: null } },
    select: { email: true },
  })
  const emails = players.map((p) => p.email).filter(Boolean) as string[]

  return sendGameDayInvitation({ id: session.id, date: session.date }, subject, body, emails)
}

// ─── Status-Update Email ──────────────────────────────────────────────────────

export async function getStatusUpdateDefaults(sessionId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      registrations: {
        include: {
          player: { select: { id: true, firstName: true, lastName: true, nickname: true, passwordHash: true } },
        },
        orderBy: { registeredAt: "asc" },
      },
    },
  })
  if (!session) throw new Error("Session not found.")

  const players = await db.player.findMany({
    where: { passwordHash: { not: null } },
    select: { id: true, firstName: true, lastName: true, nickname: true, email: true, emailNotifications: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })

  const registered = session.registrations.filter((r) => r.status === "REGISTERED").map((r) => r.player)
  const cancelled = session.registrations.filter((r) => r.status === "CANCELLED").map((r) => r.player)
  const respondedIds = new Set(session.registrations.map((r) => r.playerId))
  const noAnswer = players.filter((p) => !respondedIds.has(p.id))

  const count = registered.length
  const MIN_PLAYERS = 8

  const abbrev = (p: { firstName: string; lastName: string; nickname: string | null }) => {
    const display = p.nickname ?? p.firstName
    const lastInitial = p.lastName ? ` ${p.lastName[0].toUpperCase()}.` : ""
    return `${display}${lastInitial}`
  }

  const registeredList = registered.map(abbrev).join(", ") || "– noch niemand –"
  const cancelledList = cancelled.map(abbrev).join(", ")
  const noAnswerList = noAnswer.map(abbrev).join(", ")

  const dateStr = format(session.date, "EEEE, d. MMMM yyyy", { locale: de })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"
  const link = `${appUrl}/sessions/${session.id}`

  const trafficLight = count >= MIN_PLAYERS ? "🟢" : count >= MIN_PLAYERS - 3 ? "🟡" : "🔴"

  const subject = `${trafficLight} Spieltag ${dateStr} – ${count} von ${MIN_PLAYERS} Spielern`

  const body = `Hey Kicker,

kurzes Update zum Spieltag am ${dateStr}:

${trafficLight} Aktuell ${count} von mindestens ${MIN_PLAYERS} Spielern angemeldet.
${count >= MIN_PLAYERS ? "Der Spieltag findet voraussichtlich statt! 🎉" : count >= MIN_PLAYERS - 3 ? "Wir brauchen noch ein paar Spieler – bitte meldet euch an!" : "Leider zu wenig Spieler – der Spieltag droht auszufallen. Bitte meldet euch an!"}

✅ Zugesagt (${count}):
${registeredList}
${cancelledList ? `\n❌ Abgesagt (${cancelled.length}):\n${cancelledList}\n` : ""}${noAnswerList ? `\n⏳ Noch keine Antwort (${noAnswer.length}):\n${noAnswerList}\n` : ""}
${link}

Empor Lichtenberg`

  return {
    subject,
    body,
    registeredCount: count,
    minPlayers: MIN_PLAYERS,
    players: players.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      email: p.email,
      emailNotifications: p.emailNotifications,
    })),
  }
}

export async function sendStatusUpdate(
  sessionId: string,
  subject: string,
  body: string,
  recipientIds: string[],
) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      registrations: {
        include: { player: { select: { id: true, firstName: true, lastName: true, nickname: true, passwordHash: true } } },
        orderBy: { registeredAt: "asc" },
      },
    },
  })
  if (!session) throw new Error("Session not found.")

  const allNonGuests = await db.player.findMany({
    where: { passwordHash: { not: null } },
    select: { id: true, firstName: true, lastName: true, nickname: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })

  const abbrev = (p: { firstName: string; lastName: string; nickname: string | null }) => {
    const display = p.nickname ?? p.firstName
    return `${display} ${p.lastName[0]?.toUpperCase() ?? ""}.`.trim()
  }

  const respondedIds = new Set(session.registrations.map((r) => r.playerId))
  const lists = {
    registered: session.registrations.filter((r) => r.status === "REGISTERED").map((r) => abbrev(r.player)),
    cancelled: session.registrations.filter((r) => r.status === "CANCELLED").map((r) => abbrev(r.player)),
    noAnswer: allNonGuests.filter((p) => !respondedIds.has(p.id)).map(abbrev),
  }

  const recipients = await db.player.findMany({
    where: { id: { in: recipientIds }, passwordHash: { not: null } },
    select: { email: true },
  })
  const emails = recipients.map((p) => p.email).filter(Boolean) as string[]

  return sendStatusUpdateEmail({ id: session.id, date: session.date }, subject, body, emails, lists)
}

function revalidate(sessionId: string) {
  revalidatePath(`/sessions/${sessionId}`)
  revalidatePath("/schedule")
}

export async function reopenMatch(matchId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const match = await db.match.findUnique({ where: { id: matchId } })
  if (!match) throw new Error("Match not found.")
  if (match.status !== "COMPLETED") throw new Error("Match is not completed.")

  await db.match.update({
    where: { id: matchId },
    data: { status: "IN_PROGRESS", endedAt: null, endCondition: null },
  })

  revalidate(match.sessionId)
}

export async function reopenSession(sessionId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      teams: { include: { players: true } },
      matches: { where: { status: "COMPLETED" }, include: { goals: true, homeTeam: { include: { players: true } }, awayTeam: { include: { players: true } } } },
    },
  })
  if (!session) throw new Error("Session not found.")
  if (session.status !== "COMPLETED") throw new Error("Session is not completed.")

  // Compute the stats that were added when this session was closed so we can subtract them
  const playerGoals = new Map<string, number>()
  const playerAssists = new Map<string, number>()
  const playerMatchKeys = new Set<string>()

  for (const match of session.matches) {
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

  // Compute points awarded per player (mirrors computeAndSaveStats logic)
  const is3Team = session.teams.length === 3
  const playerPoints = new Map<string, number>()

  if (is3Team) {
    const teamStats = new Map<string, { pts: number; gf: number; ga: number }>()
    for (const team of session.teams) teamStats.set(team.id, { pts: 0, gf: 0, ga: 0 })
    for (const match of session.matches) {
      const h = teamStats.get(match.homeTeamId)!
      const a = teamStats.get(match.awayTeamId)!
      if (match.homeScore > match.awayScore) { h.pts += 3 } else if (match.homeScore < match.awayScore) { a.pts += 3 } else { h.pts += 1; a.pts += 1 }
      h.gf += match.homeScore; h.ga += match.awayScore
      a.gf += match.awayScore; a.ga += match.homeScore
    }
    const sorted = [...session.teams].sort((a, b) => {
      const sa = teamStats.get(a.id)!; const sb = teamStats.get(b.id)!
      if (sa.pts !== sb.pts) return sb.pts - sa.pts
      const gdDiff = (sb.gf - sb.ga) - (sa.gf - sa.ga)
      return gdDiff !== 0 ? gdDiff : sb.gf - sa.gf
    })
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
    for (const team of session.teams) {
      const pts = award.get(team.id) ?? 0
      for (const tp of team.players) playerPoints.set(tp.playerId, (playerPoints.get(tp.playerId) ?? 0) + pts)
    }
  } else {
    for (const match of session.matches) {
      const hPlayers = match.homeTeam.players.map((p) => p.playerId)
      const aPlayers = match.awayTeam.players.map((p) => p.playerId)
      if (match.homeScore > match.awayScore) { hPlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 3)) }
      else if (match.homeScore < match.awayScore) { aPlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 3)) }
      else { hPlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 1)); aPlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 1)) }
    }
  }

  const allPlayerIds = new Set<string>()
  for (const team of session.teams) for (const tp of team.players) allPlayerIds.add(tp.playerId)

  await db.$transaction(async (tx) => {
    // Reverse stats for each player who participated
    for (const playerId of allPlayerIds) {
      const goals = playerGoals.get(playerId) ?? 0
      const assists = playerAssists.get(playerId) ?? 0
      const points = playerPoints.get(playerId) ?? 0
      const matchesPlayed = playerMatchCount.get(playerId) ?? 0
      const score = goals + assists

      await tx.playerStats.updateMany({
        where: { playerId, seasonId: session.seasonId },
        data: {
          sessionsPlayed: { decrement: 1 },
          matchesPlayed: { decrement: matchesPlayed },
          goals: { decrement: goals },
          assists: { decrement: assists },
          score: { decrement: score },
          points: { decrement: points },
        },
      })

      await tx.playerStatsLifetime.updateMany({
        where: { playerId },
        data: {
          sessionsPlayed: { decrement: 1 },
          matchesPlayed: { decrement: matchesPlayed },
          goals: { decrement: goals },
          assists: { decrement: assists },
          score: { decrement: score },
          points: { decrement: points },
        },
      })
    }

    await tx.session.update({ where: { id: sessionId }, data: { status: "IN_PROGRESS" } })
  })

  revalidate(sessionId)
  revalidatePath("/leaderboard")
}

export async function addRegistration(sessionId: string, playerId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const existing = await db.sessionRegistration.findUnique({
    where: { sessionId_playerId: { sessionId, playerId } },
  })
  if (existing) {
    if (existing.status === "REGISTERED") throw new Error("Player is already registered.")
    await db.sessionRegistration.update({
      where: { id: existing.id },
      data: { status: "REGISTERED", registeredAt: new Date(), cancelledAt: null, registeredById: authSession.user.id },
    })
  } else {
    await db.sessionRegistration.create({
      data: { sessionId, playerId, registeredById: authSession.user.id, status: "REGISTERED" },
    })
  }
  revalidate(sessionId)
}

export async function addRegistrationBulk(sessionId: string, playerIds: string[]) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")
  if (playerIds.length === 0) return

  for (const playerId of playerIds) {
    const existing = await db.sessionRegistration.findUnique({
      where: { sessionId_playerId: { sessionId, playerId } },
    })
    if (existing) {
      if (existing.status !== "REGISTERED") {
        await db.sessionRegistration.update({
          where: { id: existing.id },
          data: { status: "REGISTERED", registeredAt: new Date(), cancelledAt: null, registeredById: authSession.user.id },
        })
      }
    } else {
      await db.sessionRegistration.create({
        data: { sessionId, playerId, registeredById: authSession.user.id, status: "REGISTERED" },
      })
    }
  }
  revalidate(sessionId)
}

export async function removeRegistration(sessionId: string, playerId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const reg = await db.sessionRegistration.findUnique({
    where: { sessionId_playerId: { sessionId, playerId } },
  })
  if (!reg || reg.status === "CANCELLED") throw new Error("Player is not registered.")
  await db.sessionRegistration.update({
    where: { id: reg.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  })
  revalidate(sessionId)
}

export async function generateTeams(
  sessionId: string,
  numTeams: 2 | 3,
  mode: "RANDOM" | "BALANCED",
) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      registrations: { where: { status: "REGISTERED" }, include: { player: { include: { statsLifetime: true } } } },
      teams: { include: { players: true } },
    },
  })
  if (!session) throw new Error("Session not found.")
  if (session.status === "IN_PROGRESS" || session.status === "COMPLETED") {
    throw new Error("Teams cannot be changed after the session has started.")
  }

  const players = session.registrations.map((r) => r.player)
  if (players.length < numTeams * 2) {
    throw new Error(`Need at least ${numTeams * 2} registered players to form ${numTeams} teams.`)
  }

  const rating = (p: typeof players[0]) =>
    p.statsLifetime && p.statsLifetime.sessionsPlayed > 0
      ? p.statsLifetime.points / p.statsLifetime.sessionsPlayed : 0

  // Build team slots
  const teamNames = Array.from({ length: numTeams }, (_, i) => `Team ${"ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i]}`)
  let slots: string[][]

  if (mode === "BALANCED" && numTeams === 2) {
    // Optimal partition: minimise |sum(A) - sum(B)|
    const ratings = players.map((p) => rating(p))
    const [idx0, idx1] = optimalPartition2(ratings)
    slots = [idx0.map((i) => players[i].id), idx1.map((i) => players[i].id)]
  } else {
    // Snake-draft: sort by rating (BALANCED) or shuffle (RANDOM), then alternate
    let ordered: typeof players
    if (mode === "BALANCED") {
      ordered = [...players].sort((a, b) => rating(b) - rating(a))
    } else {
      ordered = [...players].sort(() => Math.random() - 0.5)
    }
    slots = Array.from({ length: numTeams }, () => [] as string[])
    ordered.forEach((p, i) => {
      const round = Math.floor(i / numTeams)
      const pos = i % numTeams
      const idx = round % 2 === 0 ? pos : numTeams - 1 - pos
      slots[idx].push(p.id)
    })
  }

  // Delete old teams (cascades to TeamPlayer; also delete matches for this session if not started)
  const existingTeamIds = session.teams.map((t) => t.id)
  if (existingTeamIds.length > 0) {
    await db.match.deleteMany({ where: { sessionId, status: "PENDING" } })
    await db.teamPlayer.deleteMany({ where: { teamId: { in: existingTeamIds } } })
    await db.team.deleteMany({ where: { id: { in: existingTeamIds } } })
  }

  // Create new teams
  const createdTeams = await Promise.all(
    teamNames.map((name, i) =>
      db.team.create({
        data: {
          sessionId,
          name,
          players: { create: slots[i].map((playerId) => ({ playerId })) },
        },
      }),
    ),
  )

  // Create round-1 match(es)
  if (numTeams === 2) {
    await db.match.create({
      data: {
        sessionId,
        homeTeamId: createdTeams[0].id,
        awayTeamId: createdTeams[1].id,
        roundNumber: null,
      },
    })
  } else {
    // 3-team: A vs B, B vs C, A vs C
    const pairs = [
      [createdTeams[0].id, createdTeams[1].id],
      [createdTeams[1].id, createdTeams[2].id],
      [createdTeams[0].id, createdTeams[2].id],
    ]
    for (const [h, a] of pairs) {
      await db.match.create({
        data: { sessionId, homeTeamId: h, awayTeamId: a, roundNumber: 1 },
      })
    }
  }

  revalidate(sessionId)
}

export async function startMatch(matchId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const match = await db.match.findUnique({ where: { id: matchId }, include: { session: true } })
  if (!match) throw new Error("Match not found.")
  if (match.status !== "PENDING") throw new Error("Match cannot be started.")

  await db.match.update({ where: { id: matchId }, data: { status: "IN_PROGRESS", startedAt: new Date() } })

  if (match.session.status === "SCHEDULED") {
    await db.session.update({ where: { id: match.sessionId }, data: { status: "IN_PROGRESS" } })
  }

  revalidate(match.sessionId)
}

export async function recordGoal(
  matchId: string,
  scoredByPlayerId: string,
  teamId: string,
  assistedByPlayerId?: string,
) {
  const authSession = await auth()
  if (!authSession?.user?.id) throw new Error("Unauthorized")

  const match = await db.match.findUnique({ where: { id: matchId } })
  if (!match) throw new Error("Match not found.")
  if (match.status !== "IN_PROGRESS") throw new Error("Match is not in progress.")

  await db.goal.create({
    data: { matchId, scoredByPlayerId, teamId, assistedByPlayerId: assistedByPlayerId ?? null },
  })

  const isHome = match.homeTeamId === teamId
  const updated = await db.match.update({
    where: { id: matchId },
    data: isHome ? { homeScore: { increment: 1 } } : { awayScore: { increment: 1 } },
  })

  // Auto-end non-tournament matches when a team reaches 10 goals
  const newScore = isHome ? updated.homeScore : updated.awayScore
  if (match.roundNumber === null && newScore >= 10) {
    await db.match.update({
      where: { id: matchId },
      data: { status: "COMPLETED", endedAt: new Date(), endCondition: "GOALS" },
    })
  }

  revalidate(match.sessionId)
}

export async function undoLastGoal(matchId: string) {
  const authSession = await auth()
  if (!authSession?.user?.id) throw new Error("Unauthorized")

  const match = await db.match.findUnique({ where: { id: matchId } })
  if (!match) throw new Error("Match not found.")
  if (match.status !== "IN_PROGRESS") throw new Error("Match is not in progress.")

  const lastGoal = await db.goal.findFirst({
    where: { matchId },
    orderBy: { scoredAt: "desc" },
  })
  if (!lastGoal) throw new Error("No goals to undo.")

  await db.goal.delete({ where: { id: lastGoal.id } })

  const isHome = match.homeTeamId === lastGoal.teamId
  await db.match.update({
    where: { id: matchId },
    data: isHome ? { homeScore: { decrement: 1 } } : { awayScore: { decrement: 1 } },
  })

  revalidate(match.sessionId)
}

export async function deleteGoal(goalId: string) {
  const authSession = await auth()
  if (!authSession?.user?.id) throw new Error("Unauthorized")

  const goal = await db.goal.findUnique({ where: { id: goalId }, include: { match: true } })
  if (!goal) throw new Error("Goal not found.")

  await db.goal.delete({ where: { id: goalId } })

  // Recount remaining goals to keep score accurate
  const remaining = await db.goal.findMany({ where: { matchId: goal.matchId } })
  const homeScore = remaining.filter((g) => g.teamId === goal.match.homeTeamId).length
  const awayScore = remaining.filter((g) => g.teamId === goal.match.awayTeamId).length

  // Re-open match if it was auto-closed at 10 goals and the score is now below 10
  const shouldReopen = goal.match.status === "COMPLETED"
    && goal.match.endCondition === "GOALS"
    && homeScore < 10 && awayScore < 10

  await db.match.update({
    where: { id: goal.matchId },
    data: {
      homeScore,
      awayScore,
      ...(shouldReopen ? { status: "IN_PROGRESS", endedAt: null, endCondition: null } : {}),
    },
  })

  revalidate(goal.match.sessionId)
}

export async function updateGoal(
  goalId: string,
  scoredByPlayerId: string,
  assistedByPlayerId: string | undefined,
) {
  const authSession = await auth()
  if (!authSession?.user?.id) throw new Error("Unauthorized")

  const goal = await db.goal.findUnique({ where: { id: goalId }, include: { match: true } })
  if (!goal) throw new Error("Goal not found.")

  await db.goal.update({
    where: { id: goalId },
    data: {
      scoredByPlayerId,
      assistedByPlayerId: assistedByPlayerId ?? null,
    },
  })

  revalidate(goal.match.sessionId)
}

export async function endMatch(matchId: string, condition: "GOALS" | "TIME" | "MANUAL") {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const match = await db.match.findUnique({ where: { id: matchId } })
  if (!match) throw new Error("Match not found.")
  if (match.status !== "IN_PROGRESS") throw new Error("Match is not in progress.")

  await db.match.update({
    where: { id: matchId },
    data: { status: "COMPLETED", endedAt: new Date(), endCondition: condition },
  })

  revalidate(match.sessionId)
}

export async function startNextRound(sessionId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      teams: true,
      matches: { orderBy: { roundNumber: "desc" }, take: 1 },
    },
  })
  if (!session) throw new Error("Session not found.")
  if (session.teams.length !== 3) throw new Error("Next round only available for 3-team sessions.")

  const lastRound = session.matches[0]?.roundNumber ?? 0
  if (lastRound >= 5) throw new Error("Maximum of 5 rounds reached.")

  const [a, b, c] = session.teams
  const pairs = [
    [a.id, b.id],
    [b.id, c.id],
    [a.id, c.id],
  ]
  for (const [h, aw] of pairs) {
    await db.match.create({
      data: { sessionId, homeTeamId: h, awayTeamId: aw, roundNumber: lastRound + 1 },
    })
  }

  revalidate(sessionId)
}

export async function endSession(sessionId: string, pointsScope: PointsScope = "all") {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { matches: true },
  })
  if (!session) throw new Error("Session not found.")

  const activeMatch = session.matches.find((m) => m.status === "IN_PROGRESS")
  if (activeMatch) throw new Error("End the current match before ending the session.")

  await db.session.update({ where: { id: sessionId }, data: { status: "COMPLETED" } })
  await computeAndSaveStats(sessionId, pointsScope)

  revalidate(sessionId)
  revalidatePath("/leaderboard")
}

export async function addRematch(sessionId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      teams: true,
      matches: {
        where: { status: { not: "PENDING" } },
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  })
  if (!session) throw new Error("Session not found.")
  if (session.matches.some((m) => m.status === "IN_PROGRESS")) throw new Error("End the current match first.")

  const lastMatch = session.matches[0]
  if (!lastMatch) throw new Error("No completed match found to rematch.")

  // Reuse the teams from the most recent match — just add a new match row
  await db.match.create({
    data: { sessionId, homeTeamId: lastMatch.homeTeamId, awayTeamId: lastMatch.awayTeamId, roundNumber: null },
  })

  revalidate(sessionId)
}

export async function addNewMatch(
  sessionId: string,
  mode: "RANDOM" | "BALANCED" | "STRENGTH",
) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      registrations: { where: { status: "REGISTERED" }, include: { player: { include: { statsLifetime: true } } } },
      teams: true,
      matches: true,
    },
  })
  if (!session) throw new Error("Session not found.")
  if (session.matches.some((m) => m.status === "IN_PROGRESS")) throw new Error("End the current match first.")

  const players = session.registrations.map((r) => r.player)
  if (players.length < 2) throw new Error("Need at least 2 registered players.")

  const ratingOf = (p: typeof players[0]) =>
    p.statsLifetime && p.statsLifetime.sessionsPlayed > 0
      ? p.statsLifetime.points / p.statsLifetime.sessionsPlayed : 0

  let slots: string[][]

  if (mode === "BALANCED") {
    // Optimal partition for 2 teams
    const ratings = players.map((p) => ratingOf(p))
    const [idx0, idx1] = optimalPartition2(ratings)
    slots = [idx0.map((i) => players[i].id), idx1.map((i) => players[i].id)]
  } else if (mode === "STRENGTH") {
    const str = (p: typeof players[0]) => {
      const lt = p.statsLifetime
      if (!lt || lt.sessionsPlayed === 0) return 0
      const outcomePtsPerGD = (lt.points - lt.sessionsPlayed) / lt.sessionsPlayed
      const scorePerGD = lt.score / lt.sessionsPlayed
      return 0.6 * outcomePtsPerGD + 0.4 * scorePerGD
    }
    const ratings = players.map((p) => str(p))
    const [idx0, idx1] = optimalPartition2(ratings)
    slots = [idx0.map((i) => players[i].id), idx1.map((i) => players[i].id)]
  } else {
    // Random: snake-draft after shuffle
    const ordered = [...players].sort(() => Math.random() - 0.5)
    slots = [[], []]
    ordered.forEach((p, i) => {
      const round = Math.floor(i / 2)
      const pos = i % 2
      slots[round % 2 === 0 ? pos : 1 - pos].push(p.id)
    })
  }

  const existingNames = session.teams.map((t) => t.name)
  const [nameHome, nameAway] = nextTeamNames(existingNames, 2)

  const [newHome, newAway] = await Promise.all([
    db.team.create({
      data: {
        sessionId,
        name: nameHome,
        players: { create: slots[0].map((playerId) => ({ playerId })) },
      },
    }),
    db.team.create({
      data: {
        sessionId,
        name: nameAway,
        players: { create: slots[1].map((playerId) => ({ playerId })) },
      },
    }),
  ])

  await db.match.create({
    data: { sessionId, homeTeamId: newHome.id, awayTeamId: newAway.id, roundNumber: null },
  })

  revalidate(sessionId)
}

export async function deleteTeam(teamId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const team = await db.team.findUnique({
    where: { id: teamId },
    include: { homeMatches: true, awayMatches: true },
  })
  if (!team) throw new Error("Team not found.")

  const allMatches = [...team.homeMatches, ...team.awayMatches]
  const hasStarted = allMatches.some((m) => m.status !== "PENDING")
  if (hasStarted) throw new Error("Cannot delete a team that has already played matches.")

  await db.match.deleteMany({
    where: { status: "PENDING", OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
  })
  await db.teamPlayer.deleteMany({ where: { teamId } })
  await db.team.delete({ where: { id: teamId } })

  revalidate(team.sessionId)
}

export async function addGuestAndRegister(sessionId: string, guestName: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const name = guestName.trim()
  if (!name) throw new Error("Guest name is required.")

  // Create a guest player with a non-login email (no passwordHash → cannot log in)
  const uniqueTag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const guest = await db.player.create({
    data: {
      email: `guest-${uniqueTag}@empor.guest`,
      firstName: "Gast",
      lastName: `– ${name}`,
      role: "PLAYER",
    },
  })

  await db.sessionRegistration.create({
    data: {
      sessionId,
      playerId: guest.id,
      registeredById: authSession.user.id,
      status: "REGISTERED",
    },
  })

  revalidate(sessionId)
  return guest.id
}
