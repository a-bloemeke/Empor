"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { computeAndSaveStats } from "@/lib/stats"
import type { PointsScope } from "@/lib/types"
import { nextTeamNames, optimalPartition2, computePlayerDeltas } from "@/lib/game-logic"
import type { TeamRef, MatchRef } from "@/lib/game-logic"
import { sendGameDayInvitation, sendStatusUpdateEmail, buildDefaultInvitation, sendWelcomeEmail, sendWaitlistPromotion } from "@/lib/email"
import { buildPlayerNames } from "@/lib/player-names"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import bcrypt from "bcryptjs"

// ─── Season-aware player rating ───────────────────────────────────────────────
// Returns the two most recent season IDs (current first, previous second).
type PlayerWithSeasonStats = {
  statsPerSeason: { seasonId: string; points: number; sessionsPlayed: number; score: number }[]
}

function strFromBucket(s: { points: number; sessionsPlayed: number; score: number }): number | null {
  if (s.sessionsPlayed === 0) return null
  return 0.6 * ((s.points - s.sessionsPlayed) / s.sessionsPlayed)
    + 0.4 * (s.score / s.sessionsPlayed)
}

// (a) No current-season data → average of all past seasons.
// Returns null when player has no stats at all → caller substitutes session average (b).
function rawRating(p: PlayerWithSeasonStats, currentSeasonId: string): number | null {
  const curStats = p.statsPerSeason.find((x) => x.seasonId === currentSeasonId)
  const curStr = curStats ? strFromBucket(curStats) : null

  const histStrs = p.statsPerSeason
    .filter((x) => x.seasonId !== currentSeasonId)
    .map(strFromBucket)
    .filter((x): x is number => x !== null)
  const prevStr = histStrs.length > 0
    ? histStrs.reduce((a, b) => a + b, 0) / histStrs.length
    : null

  if (curStr !== null) return prevStr !== null ? 0.6 * curStr + 0.4 * prevStr : curStr
  if (prevStr !== null) return prevStr
  return null
}

function sessionRatings(players: PlayerWithSeasonStats[], currentSeasonId: string): number[] {
  const raw = players.map((p) => rawRating(p, currentSeasonId))
  const known = raw.filter((r): r is number => r !== null)
  const avg = known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : 0
  return raw.map((r) => r ?? avg)
}


export async function getDefaultInvitation(sessionId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({ where: { id: sessionId } })
  if (!session) throw new Error("Session not found.")

  const [defaults, players, usedQuotes, availableQuotes] = await Promise.all([
    Promise.resolve(buildDefaultInvitation({ id: session.id, date: session.date })),
    db.player.findMany({
      where: { passwordHash: { not: null } },
      select: { id: true, firstName: true, lastName: true, nickname: true, email: true, emailNotifications: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.invitationQuote.findMany({
      orderBy: { usedAt: "desc" },
      take: 20,
      select: { quote: true, author: true, usedAt: true },
    }),
    db.quoteCollection.findMany({
      orderBy: { author: "asc" },
      select: { id: true, quote: true, author: true },
    }),
  ])

  const inviteDisplayNames = buildPlayerNames(players)

  return {
    ...defaults,
    players: players.map((p) => ({
      id: p.id,
      name: inviteDisplayNames.get(p.id) ?? p.firstName,
      email: p.email,
      emailNotifications: p.emailNotifications,
    })),
    usedQuotes,
    availableQuotes,
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

  // If this quote came from the collection, remove it (it's now tracked as used)
  if (quote) {
    await db.quoteCollection.deleteMany({
      where: { quote: quote.text, author: quote.author },
    })
  }

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

function buildSummaryText(session: SummarySession, dateStr: string, beerBringerName?: string | null): string {
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

  // Infer points scope from what was actually played:
  // if there are tournament rounds AND normal matches, use "all"
  // if only tournament rounds, use "tournament"
  // otherwise "normal"
  const hasTournament = completedMatches.some((m) => m.roundNumber != null)
  const hasNormal = completedMatches.some((m) => m.roundNumber == null)
  const scope: PointsScope = hasTournament && hasNormal ? "all" : hasTournament ? "tournament" : "normal"

  const deltas = computePlayerDeltas(teamRefs, matchRefs, scope)
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

  // Group matches: tournament rounds first, then normal matches
  const tournamentMatches = completedMatches.filter((m) => m.roundNumber != null)
  const normalMatches = completedMatches.filter((m) => m.roundNumber == null)

  if (tournamentMatches.length > 0) {
    lines.push("=== 🏆 Turnier ===")
    // Group by round number
    const byRound = new Map<number, typeof tournamentMatches>()
    for (const m of tournamentMatches) {
      const r = m.roundNumber!
      if (!byRound.has(r)) byRound.set(r, [])
      byRound.get(r)!.push(m)
    }
    for (const [round, roundMatches] of [...byRound.entries()].sort((a, b) => a[0] - b[0])) {
      lines.push(`  Runde ${round}:`)
      for (const m of roundMatches) {
        const winner = m.homeScore > m.awayScore ? m.homeTeam.name : m.awayScore > m.homeScore ? m.awayTeam.name : null
        const suffix = winner ? `  → ${winner} gewinnt` : "  → Unentschieden"
        lines.push(`    ${m.homeTeam.name} ${m.homeScore} : ${m.awayScore} ${m.awayTeam.name}${suffix}`)
      }
    }
    lines.push("")
  }

  if (normalMatches.length > 0) {
    lines.push("=== ⚽ Normale Spiele ===")
    for (const m of normalMatches) {
      const winner = m.homeScore > m.awayScore ? m.homeTeam.name : m.awayScore > m.homeScore ? m.awayTeam.name : null
      const suffix = winner ? `  → ${winner} gewinnt` : "  → Unentschieden"
      lines.push(`  ${m.homeTeam.name} ${m.homeScore} : ${m.awayScore} ${m.awayTeam.name}${suffix}`)
    }
    lines.push("")
  }

  lines.push("=== Spieler-Statistiken ===")
  lines.push("(Punkte: 1 Teilnahme + Siegpunkte: Sieg +3 / Unentschieden +1)")
  sorted.forEach((row, i) => {
    const name = nameById.get(row.playerId) ?? row.playerId
    const outcomePts = row.points - 1  // subtract attendance point to show breakdown
    const breakdown = outcomePts > 0 ? `1+${outcomePts}` : "1"
    lines.push(`${i + 1}. ${name.padEnd(20)} ${row.goals}T  ${row.assists}V  ${row.goals + row.assists} Score  ${row.points} Pkt (${breakdown})`)
  })
  lines.push("")

  if (sorted.length > 0 && (sorted[0].goals + sorted[0].assists + sorted[0].points) > 0) {
    const topScore = sorted[0].goals + sorted[0].assists + sorted[0].points
    const topGoals = sorted[0].goals
    const topAssists = sorted[0].assists
    const mvps = sorted.filter((p) =>
      p.goals + p.assists + p.points === topScore &&
      p.goals === topGoals &&
      p.assists === topAssists
    )
    const mvpNames = mvps.map((p) => nameById.get(p.playerId) ?? p.playerId).join(", ")
    const stats = `${sorted[0].goals} Tore, ${sorted[0].assists} Vorlagen, ${sorted[0].points} Punkte`
    lines.push(`👑 MVP: ${mvpNames} (${stats})`)
    lines.push("")
  }

  lines.push("Empor Lichtenberg")
  if (beerBringerName) {
    lines.splice(lines.length - 1, 0, `🍺 Hat Bier mitgebracht: ${beerBringerName}`, "")
  }
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

  const beerReg = await db.sessionRegistration.findFirst({
    where: { sessionId, beerBringer: true },
    include: { player: { select: { firstName: true, nickname: true } } },
  })
  const beerBringerName = beerReg
    ? (beerReg.player.nickname ?? beerReg.player.firstName)
    : null

  const body = buildSummaryText(session, dateStr, beerBringerName)

  const summaryDisplayNames = buildPlayerNames(players)

  return {
    subject,
    body,
    players: players.map((p) => ({
      id: p.id,
      name: summaryDisplayNames.get(p.id) ?? p.firstName,
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
    where: { passwordHash: { not: null }, active: true },
    select: { id: true, firstName: true, lastName: true, nickname: true, email: true, emailNotifications: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })

  const registered = session.registrations.filter((r) => r.status === "REGISTERED").map((r) => r.player)
  const maybe = session.registrations.filter((r) => r.status === "MAYBE").map((r) => r.player)
  const cancelled = session.registrations.filter((r) => r.status === "CANCELLED").map((r) => r.player)
  const waitlisted = session.registrations.filter((r) => r.status === "WAITLISTED").map((r) => r.player)
  const respondedIds = new Set(session.registrations.map((r) => r.playerId))
  const noAnswer = players.filter((p) => !respondedIds.has(p.id))

  const count = registered.length
  const MIN_PLAYERS = 8
  const hoursUntil = (session.date.getTime() - Date.now()) / (1000 * 60 * 60)
  const enough = count >= MIN_PLAYERS
  const critical = !enough && hoursUntil <= 32
  const trafficLight = enough ? "🟢" : critical ? "🔴" : "🟡"
  const statusText = enough
    ? "Der Spieltag findet voraussichtlich statt! 🎉"
    : critical
    ? "Leider zu wenig Spieler – der Spieltag droht auszufallen. Bitte meldet euch an!"
    : "Wir brauchen noch ein paar Spieler – bitte meldet euch an!"

  const displayNames = buildPlayerNames(players)

  const pn = (p: { id: string; firstName: string; lastName: string }) =>
    displayNames.get(p.id) ?? `${p.firstName} ${p.lastName}`.trim()

  const registeredList = registered.map(pn).join(", ") || "– noch niemand –"
  const maybeList = maybe.map(pn).join(", ")
  const cancelledList = cancelled.map(pn).join(", ")
  const waitlistedList = waitlisted.map(pn).join(", ")
  const noAnswerList = noAnswer.map(pn).join(", ")

  const beerBringerReg = session.registrations.find((r) => r.status === "REGISTERED" && r.beerBringer)
  const beerBringerName = beerBringerReg ? pn(beerBringerReg.player) : null

  const dateStr = format(session.date, "EEEE, d. MMMM yyyy", { locale: de })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"
  const link = `${appUrl}/sessions/${session.id}`

  const subject = `${trafficLight} Spieltag ${dateStr} – ${count} von ${MIN_PLAYERS} Spielern`

  const body = `Hey Kicker,

kurzes Update zum Spieltag am ${dateStr}:

${trafficLight} Aktuell ${count} von mindestens ${MIN_PLAYERS} Spielern angemeldet.
${statusText}

✅ Zugesagt (${count}):
${registeredList}
${maybeList ? `\n❓ Vielleicht (${maybe.length}):\n${maybeList}\n` : ""}${waitlistedList ? `\n⏳ Warteliste (${waitlisted.length}):\n${waitlistedList}\n` : ""}${cancelledList ? `\n❌ Abgesagt (${cancelled.length}):\n${cancelledList}\n` : ""}${noAnswerList ? `\n⏳ Noch keine Antwort (${noAnswer.length}):\n${noAnswerList}\n` : ""}${beerBringerName ? `\n🍺 Bringt Bier: ${beerBringerName}\n` : ""}
${link}

Empor Lichtenberg`

  // Compute delta since last status email
  const since = session.lastStatusEmailSentAt
  const newRegistrations = since
    ? session.registrations
        .filter((r) => r.status === "REGISTERED" && r.registeredAt > since)
        .map((r) => pn(r.player))
    : []
  const newCancellations = since
    ? session.registrations
        .filter((r) => r.status === "CANCELLED" && r.cancelledAt && r.cancelledAt > since)
        .map((r) => pn(r.player))
    : []

  return {
    subject,
    body,
    registeredCount: count,
    minPlayers: MIN_PLAYERS,
    lastSentAt: session.lastStatusEmailSentAt?.toISOString() ?? null,
    delta: { newRegistrations, newCancellations },
    lists: {
      registered: registered.map(pn),
      maybe: maybe.map(pn),
      cancelled: cancelled.map(pn),
      noAnswer: noAnswer.map(pn),
    },
    players: players.map((p) => ({
      id: p.id,
      name: displayNames.get(p.id) ?? p.firstName,
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
    where: { passwordHash: { not: null }, active: true },
    select: { id: true, firstName: true, lastName: true, nickname: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })

  const displayNames = buildPlayerNames(allNonGuests)
  const abbrev = (p: { id: string; firstName: string; lastName: string }) =>
    displayNames.get(p.id) ?? `${p.firstName} ${p.lastName}`.trim()

  const respondedIds = new Set(session.registrations.map((r) => r.playerId))
  const lists = {
    registered: session.registrations.filter((r) => r.status === "REGISTERED").map((r) => abbrev(r.player)),
    maybe: session.registrations.filter((r) => r.status === "MAYBE").map((r) => abbrev(r.player)),
    cancelled: session.registrations.filter((r) => r.status === "CANCELLED").map((r) => abbrev(r.player)),
    noAnswer: allNonGuests.filter((p) => !respondedIds.has(p.id)).map(abbrev),
  }

  const since = session.lastStatusEmailSentAt
  const delta = {
    newRegistrations: since
      ? session.registrations
          .filter((r) => r.status === "REGISTERED" && r.registeredAt > since)
          .map((r) => abbrev(r.player))
      : [],
    newCancellations: since
      ? session.registrations
          .filter((r) => r.status === "CANCELLED" && r.cancelledAt && r.cancelledAt > since)
          .map((r) => abbrev(r.player))
      : [],
  }

  const recipients = await db.player.findMany({
    where: { id: { in: recipientIds }, passwordHash: { not: null } },
    select: { email: true },
  })
  const emails = recipients.map((p) => p.email).filter(Boolean) as string[]

  await sendStatusUpdateEmail({ id: session.id, date: session.date }, subject, body, emails, lists, delta)

  await db.session.update({ where: { id: sessionId }, data: { lastStatusEmailSentAt: new Date() } })

  return emails.length
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

  const beerReg = await db.sessionRegistration.findFirst({
    where: { sessionId, beerBringer: true },
    select: { playerId: true },
  })

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

    if (beerReg) {
      await tx.playerStats.updateMany({
        where: { playerId: beerReg.playerId, seasonId: session.seasonId },
        data: { beers: { decrement: 1 } },
      })
      await tx.playerStatsLifetime.updateMany({
        where: { playerId: beerReg.playerId },
        data: { beers: { decrement: 1 } },
      })
    }
  })

  revalidate(sessionId)
  revalidatePath("/leaderboard")
}

export async function setMaxPlayers(sessionId: string, maxPlayers: number) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")
  if (maxPlayers < 1) throw new Error("Ungültiger Wert.")
  await db.session.update({ where: { id: sessionId }, data: { maxPlayers } })
  revalidate(sessionId)
}

export async function addRegistration(sessionId: string, playerId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({ where: { id: sessionId } })
  if (!session) throw new Error("Session not found.")

  const cap = session.maxPlayers ?? 12
  const registeredCount = await db.sessionRegistration.count({
    where: { sessionId, status: "REGISTERED" },
  })
  if (registeredCount >= cap) {
    throw new Error(`Maximale Spielerzahl (${cap}) erreicht. Bitte erhöhe den Wert zuerst.`)
  }

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

  const session = await db.session.findUnique({ where: { id: sessionId } })
  if (!session) throw new Error("Session not found.")

  const cap = session.maxPlayers ?? 12
  const registeredCount = await db.sessionRegistration.count({
    where: { sessionId, status: "REGISTERED" },
  })
  const available = cap - registeredCount
  if (available <= 0) {
    throw new Error(`Maximale Spielerzahl (${cap}) erreicht. Bitte erhöhe den Wert zuerst.`)
  }
  if (playerIds.length > available) {
    throw new Error(`Nur noch ${available} Platz${available === 1 ? "" : "plätze"} frei (max. ${cap}).`)
  }

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

  const session = await db.session.findUnique({ where: { id: sessionId } })
  if (!session) throw new Error("Session not found.")

  const reg = await db.sessionRegistration.findUnique({
    where: { sessionId_playerId: { sessionId, playerId } },
  })
  if (!reg || reg.status === "CANCELLED") throw new Error("Player is not registered.")
  await db.sessionRegistration.update({
    where: { id: reg.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), beerBringer: false },
  })

  // Auto-promote first waitlisted player if session has a cap
  if (session.maxPlayers ?? true) {
    const firstWaitlisted = await db.sessionRegistration.findFirst({
      where: { sessionId, status: "WAITLISTED" },
      orderBy: { registeredAt: "asc" },
      include: { player: { select: { id: true, email: true, firstName: true, emailNotifications: true } } },
    })
    if (firstWaitlisted) {
      await db.sessionRegistration.update({
        where: { id: firstWaitlisted.id },
        data: { status: "REGISTERED", registeredAt: new Date() },
      })
      const p = firstWaitlisted.player
      if (p.emailNotifications && p.email) {
        await sendWaitlistPromotion(session, p)
      }
    }
  }

  revalidate(sessionId)
}

export async function addToWaitingList(sessionId: string, playerId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const existing = await db.sessionRegistration.findUnique({
    where: { sessionId_playerId: { sessionId, playerId } },
  })
  if (existing) {
    if (existing.status === "WAITLISTED") throw new Error("Player is already on the waitlist.")
    await db.sessionRegistration.update({
      where: { id: existing.id },
      data: { status: "WAITLISTED", cancelledAt: null, beerBringer: false },
    })
  } else {
    await db.sessionRegistration.create({
      data: { sessionId, playerId, registeredById: authSession.user.id!, status: "WAITLISTED" },
    })
  }
  revalidate(sessionId)
}

export async function removeFromWaitingList(sessionId: string, playerId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const existing = await db.sessionRegistration.findUnique({
    where: { sessionId_playerId: { sessionId, playerId } },
  })
  if (!existing || existing.status !== "WAITLISTED") throw new Error("Player is not on the waitlist.")
  await db.sessionRegistration.update({
    where: { id: existing.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  })
  revalidate(sessionId)
}

export async function cancelRegistrationAdmin(sessionId: string, playerId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const existing = await db.sessionRegistration.findUnique({
    where: { sessionId_playerId: { sessionId, playerId } },
  })
  if (existing) {
    if (existing.status === "CANCELLED") return
    await db.sessionRegistration.update({
      where: { id: existing.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), beerBringer: false },
    })
  } else {
    await db.sessionRegistration.create({
      data: { sessionId, playerId, registeredById: authSession.user.id!, status: "CANCELLED", cancelledAt: new Date() },
    })
  }
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
      registrations: {
        where: { status: "REGISTERED" },
        include: {
          player: {
            include: {
              statsPerSeason: { select: { seasonId: true, points: true, sessionsPlayed: true, score: true } },
            },
          },
        },
      },
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

  const ratings = sessionRatings(players, session.seasonId)

  // Build team slots
  const teamNames = Array.from({ length: numTeams }, (_, i) => `Team ${"ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i]}`)
  let slots: string[][]

  if (mode === "BALANCED" && numTeams === 2) {
    const [idx0, idx1] = optimalPartition2(ratings)
    slots = [idx0.map((i) => players[i].id), idx1.map((i) => players[i].id)]
  } else {
    let ordered: { id: string }[]
    if (mode === "BALANCED") {
      ordered = players.map((p, i) => ({ id: p.id, r: ratings[i] })).sort((a, b) => (b as {r:number}).r - (a as {r:number}).r)
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
    // 3-team round 1: A-B, A-C, B-C
    const pairs = [
      [createdTeams[0].id, createdTeams[1].id],
      [createdTeams[0].id, createdTeams[2].id],
      [createdTeams[1].id, createdTeams[2].id],
    ]
    for (const [h, a] of pairs) {
      await db.match.create({
        data: { sessionId, homeTeamId: h, awayTeamId: a, roundNumber: 1 },
      })
    }
  }

  revalidate(sessionId)
}

export async function addPlayerToTeam(sessionId: string, playerId: string, teamId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { matches: { select: { status: true, homeTeamId: true, awayTeamId: true } } },
  })
  if (!session) throw new Error("Session not found.")

  const startedTeamIds = new Set(
    session.matches.filter((m) => m.status !== "PENDING").flatMap((m) => [m.homeTeamId, m.awayTeamId])
  )
  if (startedTeamIds.has(teamId)) throw new Error("Cannot modify a team that has started playing.")

  await db.teamPlayer.create({ data: { teamId, playerId } })
  revalidate(sessionId)
}

export async function movePlayer(
  sessionId: string,
  playerId: string,
  fromTeamId: string,
  toTeamId: string,
) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { matches: { select: { status: true, homeTeamId: true, awayTeamId: true } } },
  })
  if (!session) throw new Error("Session not found.")

  const startedTeamIds = new Set(
    session.matches
      .filter((m) => m.status !== "PENDING")
      .flatMap((m) => [m.homeTeamId, m.awayTeamId]),
  )
  if (startedTeamIds.has(fromTeamId) || startedTeamIds.has(toTeamId)) {
    throw new Error("Cannot move players once a match has started.")
  }

  await db.$transaction([
    db.teamPlayer.delete({ where: { teamId_playerId: { teamId: fromTeamId, playerId } } }),
    db.teamPlayer.create({ data: { teamId: toTeamId, playerId } }),
  ])
  revalidate(sessionId)
}

export async function createEmptyTeam(sessionId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { teams: { select: { name: true } } },
  })
  if (!session) throw new Error("Session not found.")
  if (session.status === "IN_PROGRESS" || session.status === "COMPLETED") {
    throw new Error("Cannot add teams after the session has started.")
  }

  const usedLetters = new Set(session.teams.map((t) => t.name.replace("Team ", "")))
  const nextLetter = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((l) => !usedLetters.has(l)) ?? "?"

  await db.team.create({ data: { sessionId, name: `Team ${nextLetter}` } })
  revalidate(sessionId)
}

export async function createMatchesFromTeams(sessionId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { teams: true, matches: true },
  })
  if (!session) throw new Error("Session not found.")
  if (session.matches.length > 0) throw new Error("Matches already exist for this session.")
  if (session.teams.length < 2) throw new Error("Need at least 2 teams to create matches.")
  if (session.teams.length > 3) throw new Error("Cannot auto-create matches for more than 3 teams.")

  const [t0, t1, t2] = session.teams

  if (session.teams.length === 2) {
    await db.match.create({ data: { sessionId, homeTeamId: t0.id, awayTeamId: t1.id, roundNumber: null } })
  } else {
    // Round 1: A-B, A-C, B-C  (A plays first two as home, then B vs C)
    const pairs = [[t0.id, t1.id], [t0.id, t2.id], [t1.id, t2.id]]
    for (const [h, a] of pairs) {
      await db.match.create({ data: { sessionId, homeTeamId: h, awayTeamId: a, roundNumber: 1 } })
    }
  }

  revalidate(sessionId)
}

export async function generateTeamsWithPins(
  sessionId: string,
  numTeams: 2 | 3,
  mode: "RANDOM" | "BALANCED",
  pins: Record<number, string[]>,
) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      registrations: {
        where: { status: "REGISTERED" },
        include: {
          player: {
            include: {
              statsPerSeason: { select: { seasonId: true, points: true, sessionsPlayed: true, score: true } },
            },
          },
        },
      },
      teams: { include: { players: true } },
    },
  })
  if (!session) throw new Error("Session not found.")
  if (session.status === "IN_PROGRESS" || session.status === "COMPLETED") {
    throw new Error("Teams cannot be changed after the session has started.")
  }

  const allPlayers = session.registrations.map((r) => r.player)
  if (allPlayers.length < numTeams * 2) {
    throw new Error(`Need at least ${numTeams * 2} registered players to form ${numTeams} teams.`)
  }

  const pinnedIds = new Set(Object.values(pins).flat())
  const freePlayers = allPlayers.filter((p) => !pinnedIds.has(p.id))

  const allRatings = sessionRatings(allPlayers, session.seasonId)
  const ratingById = new Map(allPlayers.map((p, i) => [p.id, allRatings[i]]))
  const freeRatings = freePlayers.map((p) => ratingById.get(p.id)!)

  let freeSlots: string[][]
  if (mode === "BALANCED" && numTeams === 2) {
    const [idx0, idx1] = optimalPartition2(freeRatings)
    freeSlots = [idx0.map((i) => freePlayers[i].id), idx1.map((i) => freePlayers[i].id)]
  } else {
    let ordered: { id: string }[]
    if (mode === "BALANCED") {
      ordered = freePlayers.map((p, i) => ({ id: p.id, r: freeRatings[i] })).sort((a, b) => (b as {r:number}).r - (a as {r:number}).r)
    } else {
      ordered = [...freePlayers].sort(() => Math.random() - 0.5)
    }
    freeSlots = Array.from({ length: numTeams }, () => [] as string[])
    ordered.forEach((p, i) => {
      const round = Math.floor(i / numTeams)
      const pos = i % numTeams
      const idx = round % 2 === 0 ? pos : numTeams - 1 - pos
      freeSlots[idx].push(p.id)
    })
  }

  const teamNames = Array.from({ length: numTeams }, (_, i) => `Team ${"ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i]}`)
  const slots = Array.from({ length: numTeams }, (_, i) => [...(pins[i] ?? []), ...freeSlots[i]])

  const existingTeamIds = session.teams.map((t) => t.id)
  if (existingTeamIds.length > 0) {
    await db.match.deleteMany({ where: { sessionId, status: "PENDING" } })
    await db.teamPlayer.deleteMany({ where: { teamId: { in: existingTeamIds } } })
    await db.team.deleteMany({ where: { id: { in: existingTeamIds } } })
  }

  const createdTeams = await Promise.all(
    teamNames.map((name, i) =>
      db.team.create({
        data: { sessionId, name, players: { create: slots[i].map((playerId) => ({ playerId })) } },
      }),
    ),
  )

  if (numTeams === 2) {
    await db.match.create({
      data: { sessionId, homeTeamId: createdTeams[0].id, awayTeamId: createdTeams[1].id, roundNumber: null },
    })
  } else {
    // Round 1: A-B, A-C, B-C
    const pairs = [[createdTeams[0].id, createdTeams[1].id], [createdTeams[0].id, createdTeams[2].id], [createdTeams[1].id, createdTeams[2].id]]
    for (const [h, a] of pairs) {
      await db.match.create({ data: { sessionId, homeTeamId: h, awayTeamId: a, roundNumber: 1 } })
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

  const nextRound = lastRound + 1
  const [a, b, c] = session.teams

  // Odd rounds (1,3,5...): A-B, A-C, B-C  (A plays home first two matches)
  // Even rounds (2,4,...): B-A, C-A, C-B  (all home/away flipped from odd)
  const pairs = nextRound % 2 === 1
    ? [[a.id, b.id], [a.id, c.id], [b.id, c.id]]
    : [[b.id, a.id], [c.id, a.id], [c.id, b.id]]

  for (const [h, aw] of pairs) {
    await db.match.create({
      data: { sessionId, homeTeamId: h, awayTeamId: aw, roundNumber: nextRound },
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
      registrations: {
        where: { status: "REGISTERED" },
        include: {
          player: {
            include: {
              statsPerSeason: { select: { seasonId: true, points: true, sessionsPlayed: true, score: true } },
            },
          },
        },
      },
      teams: true,
      matches: true,
    },
  })
  if (!session) throw new Error("Session not found.")
  if (session.matches.some((m) => m.status === "IN_PROGRESS")) throw new Error("End the current match first.")

  const players = session.registrations.map((r) => r.player)
  if (players.length < 2) throw new Error("Need at least 2 registered players.")

  const ratings = sessionRatings(players, session.seasonId)

  let slots: string[][]

  if (mode === "BALANCED" || mode === "STRENGTH") {
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

  const session = await db.session.findUnique({ where: { id: sessionId } })
  if (!session) throw new Error("Session not found.")

  const cap = session.maxPlayers ?? 12
  const registeredCount = await db.sessionRegistration.count({
    where: { sessionId, status: "REGISTERED" },
  })
  if (registeredCount >= cap) {
    throw new Error(`Maximale Spielerzahl (${cap}) erreicht. Bitte erhöhe den Wert zuerst.`)
  }

  const duplicate = await db.sessionRegistration.findFirst({
    where: {
      sessionId,
      status: { in: ["REGISTERED", "WAITLISTED", "PENDING"] },
      player: { firstName: name, passwordHash: null },
    },
  })
  if (duplicate) throw new Error(`Ein Gast mit dem Namen "${name}" ist bereits angemeldet.`)

  // Create a guest player with a non-login email (no passwordHash → cannot log in)
  const uniqueTag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const guest = await db.player.create({
    data: {
      email: `guest-${uniqueTag}@empor.guest`,
      firstName: name,
      lastName: "(Gast)",
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

export async function removeGuestAndPlayer(sessionId: string, playerId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const player = await db.player.findUnique({ where: { id: playerId } })
  if (!player || player.passwordHash !== null) throw new Error("Nicht ein Gastspieler.")

  await db.sessionRegistration.deleteMany({ where: { sessionId, playerId } })
  await db.teamPlayer.deleteMany({ where: { playerId, team: { sessionId } } })
  try {
    await db.player.delete({ where: { id: playerId } })
  } catch {
    // Goals or other references exist — leave the player record, registration is already gone
  }

  revalidate(sessionId)
}

export async function renameGuest(sessionId: string, playerId: string, newName: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const name = newName.trim()
  if (!name) throw new Error("Name ist erforderlich.")

  const player = await db.player.findUnique({ where: { id: playerId } })
  if (!player || player.passwordHash !== null) throw new Error("Nicht ein Gastspieler.")

  const duplicate = await db.sessionRegistration.findFirst({
    where: {
      sessionId,
      status: { in: ["REGISTERED", "WAITLISTED", "PENDING"] },
      player: { firstName: name, passwordHash: null },
      NOT: { playerId },
    },
  })
  if (duplicate) throw new Error(`Ein Gast mit dem Namen "${name}" ist bereits angemeldet.`)

  await db.player.update({ where: { id: playerId }, data: { firstName: name } })

  revalidate(sessionId)
}

export async function convertGuestToPlayer(playerId: string, firstName: string, lastName: string, email: string, password: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const trimmedFirst = firstName.trim()
  const trimmedLast = lastName.trim()
  const trimmedEmail = email.trim().toLowerCase()
  if (!trimmedFirst) throw new Error("Vorname ist erforderlich.")
  if (!trimmedLast) throw new Error("Nachname ist erforderlich.")
  if (!trimmedEmail) throw new Error("E-Mail-Adresse ist erforderlich.")
  if (password.length < 6) throw new Error("Passwort muss mindestens 6 Zeichen haben.")

  const player = await db.player.findUnique({ where: { id: playerId } })
  if (!player) throw new Error("Spieler nicht gefunden.")
  if (player.passwordHash) throw new Error("Dieser Spieler hat bereits ein Konto.")

  const existing = await db.player.findFirst({ where: { email: trimmedEmail, id: { not: playerId } } })
  if (existing) throw new Error("Diese E-Mail-Adresse wird bereits verwendet.")

  const passwordHash = await bcrypt.hash(password, 10)

  await db.player.update({
    where: { id: playerId },
    data: { firstName: trimmedFirst, lastName: trimmedLast, email: trimmedEmail, passwordHash, active: true },
  })

  await sendWelcomeEmail({ email: trimmedEmail, firstName: trimmedFirst })

  revalidatePath("/sessions", "layout")
  revalidatePath("/schedule")
}

export async function toggleBeerAdmin(sessionId: string, playerId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const reg = await db.sessionRegistration.findUnique({
    where: { sessionId_playerId: { sessionId, playerId } },
  })
  if (!reg || reg.status !== "REGISTERED") throw new Error("Spieler ist nicht angemeldet.")

  await db.sessionRegistration.update({
    where: { id: reg.id },
    data: { beerBringer: !reg.beerBringer },
  })

  revalidate(sessionId)
}

export async function approveRegistration(sessionId: string, playerId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const reg = await db.sessionRegistration.findUnique({
    where: { sessionId_playerId: { sessionId, playerId } },
  })
  if (!reg) throw new Error("Anmeldung nicht gefunden.")
  if (reg.status !== "PENDING") throw new Error("Anmeldung ist nicht ausstehend.")

  await db.sessionRegistration.update({
    where: { id: reg.id },
    data: { status: "REGISTERED", registeredAt: new Date() },
  })

  const player = await db.player.findUnique({
    where: { id: playerId },
    select: { email: true, firstName: true, emailNotifications: true },
  })
  const session = await db.session.findUnique({ where: { id: sessionId } })
  if (player?.emailNotifications && player.email && session) {
    const { sendRsvpConfirmation } = await import("@/lib/email")
    await sendRsvpConfirmation(session, player)
  }

  revalidate(sessionId)
}

export async function rejectRegistration(sessionId: string, playerId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const reg = await db.sessionRegistration.findUnique({
    where: { sessionId_playerId: { sessionId, playerId } },
  })
  if (!reg) throw new Error("Anmeldung nicht gefunden.")
  if (reg.status !== "PENDING") throw new Error("Anmeldung ist nicht ausstehend.")

  await db.sessionRegistration.update({
    where: { id: reg.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  })

  revalidate(sessionId)
}
