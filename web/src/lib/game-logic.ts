import type { PointsScope } from "@/lib/types"

// ─── Shared types used by pure logic ─────────────────────────────────────────

export type TeamRef = { id: string; playerIds: string[] }

export type MatchRef = {
  id: string
  homeTeamId: string
  awayTeamId: string
  homeScore: number
  awayScore: number
  roundNumber: number | null
  goals: { scoredByPlayerId: string; assistedByPlayerId: string | null }[]
  homePlayers: string[]   // player IDs
  awayPlayers: string[]
}

export type PlayerStatDelta = {
  playerId: string
  goals: number
  assists: number
  matchesPlayed: number
  points: number
}

// ─── Tournament placement awards ─────────────────────────────────────────────

export function computeTournamentAward(teams: TeamRef[], matches: MatchRef[]): Map<string, number> {
  const award = new Map<string, number>()
  if (teams.length !== 3) return award

  const teamStats = new Map<string, { pts: number; gf: number; ga: number }>()
  for (const t of teams) teamStats.set(t.id, { pts: 0, gf: 0, ga: 0 })

  for (const m of matches) {
    const h = teamStats.get(m.homeTeamId)
    const a = teamStats.get(m.awayTeamId)
    if (!h || !a) continue
    if (m.homeScore > m.awayScore) { h.pts += 3 }
    else if (m.homeScore < m.awayScore) { a.pts += 3 }
    else { h.pts += 1; a.pts += 1 }
    h.gf += m.homeScore; h.ga += m.awayScore
    a.gf += m.awayScore; a.ga += m.homeScore
  }

  const sorted = [...teams].sort((a, b) => {
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

  if (allTied) {
    for (const t of sorted) award.set(t.id, 3)
  } else if (topTied) {
    award.set(sorted[0].id, 6); award.set(sorted[1].id, 6); award.set(sorted[2].id, 0)
  } else if (bottomTied) {
    award.set(sorted[0].id, 6); award.set(sorted[1].id, 3); award.set(sorted[2].id, 3)
  } else {
    award.set(sorted[0].id, 6); award.set(sorted[1].id, 3); award.set(sorted[2].id, 0)
  }
  return award
}

// ─── Per-player stat deltas from a session ────────────────────────────────────

export function computePlayerDeltas(
  teams: TeamRef[],
  matches: MatchRef[],
  pointsScope: PointsScope,
): PlayerStatDelta[] {
  const playerGoals = new Map<string, number>()
  const playerAssists = new Map<string, number>()
  const playerMatchKeys = new Set<string>()

  for (const m of matches) {
    m.homePlayers.forEach((id) => playerMatchKeys.add(`${m.id}:${id}`))
    m.awayPlayers.forEach((id) => playerMatchKeys.add(`${m.id}:${id}`))
    for (const g of m.goals) {
      playerGoals.set(g.scoredByPlayerId, (playerGoals.get(g.scoredByPlayerId) ?? 0) + 1)
      if (g.assistedByPlayerId)
        playerAssists.set(g.assistedByPlayerId, (playerAssists.get(g.assistedByPlayerId) ?? 0) + 1)
    }
  }

  const playerMatchCount = new Map<string, number>()
  for (const key of playerMatchKeys) {
    const id = key.split(":")[1]
    playerMatchCount.set(id, (playerMatchCount.get(id) ?? 0) + 1)
  }

  const playerPoints = new Map<string, number>()

  if (pointsScope !== "none") {
    const tournamentMatches = matches.filter((m) => m.roundNumber != null)
    const normalMatches = matches.filter((m) => m.roundNumber == null)

    if ((pointsScope === "all" || pointsScope === "tournament") && tournamentMatches.length > 0) {
      const tournamentTeamIds = new Set(tournamentMatches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))
      const tournamentTeams = teams.filter((t) => tournamentTeamIds.has(t.id))

      if (tournamentTeams.length === 3) {
        const award = computeTournamentAward(tournamentTeams, tournamentMatches)
        for (const t of tournamentTeams) {
          const pts = award.get(t.id) ?? 0
          for (const pid of t.playerIds)
            playerPoints.set(pid, (playerPoints.get(pid) ?? 0) + pts)
        }
      } else {
        for (const m of tournamentMatches) {
          if (m.homeScore > m.awayScore) { m.homePlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 3)) }
          else if (m.homeScore < m.awayScore) { m.awayPlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 3)) }
          else { [...m.homePlayers, ...m.awayPlayers].forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 1)) }
        }
      }
    }

    if ((pointsScope === "all" || pointsScope === "normal") && normalMatches.length > 0) {
      for (const m of normalMatches) {
        if (m.homeScore > m.awayScore) { m.homePlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 3)) }
        else if (m.homeScore < m.awayScore) { m.awayPlayers.forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 3)) }
        else { [...m.homePlayers, ...m.awayPlayers].forEach((id) => playerPoints.set(id, (playerPoints.get(id) ?? 0) + 1)) }
      }
    }
  }

  const allPlayerIds = new Set<string>()
  for (const t of teams) for (const id of t.playerIds) allPlayerIds.add(id)

  return [...allPlayerIds].map((playerId) => ({
    playerId,
    goals: playerGoals.get(playerId) ?? 0,
    assists: playerAssists.get(playerId) ?? 0,
    matchesPlayed: playerMatchCount.get(playerId) ?? 0,
    // +1 participation point for showing up, on top of match/tournament points
    points: (playerPoints.get(playerId) ?? 0) + 1,
  }))
}

// ─── Team name sequencing ─────────────────────────────────────────────────────

export function nextTeamNames(existingTeamNames: string[], numTeams: 2 | 3): string[] {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  for (let i = 0; i + numTeams <= letters.length; i += numTeams) {
    const names = Array.from({ length: numTeams }, (_, j) => `Team ${letters[i + j]}`)
    if (!names.some((n) => existingTeamNames.includes(n))) return names
  }
  return Array.from({ length: numTeams }, (_, j) => `Team ${letters[j]}`)
}

// ─── Optimal 2-team partition ─────────────────────────────────────────────────
// Finds the assignment of n players into 2 teams that minimises the absolute
// difference of their total ratings. Uses dynamic-programming subset-sum for
// n ≤ 20, falls back to snake-draft for larger groups.
//
// Returns [team0Indices, team1Indices] (indices into the input array).

export function optimalPartition2(ratings: number[]): [number[], number[]] {
  const n = ratings.length

  // For odd n: pull the lowest-rated player as a floater, balance the even remainder,
  // then append the floater to a random team so sizes stay as equal as possible (k vs k+1).
  if (n % 2 !== 0) {
    const floaterIdx = ratings.indexOf(Math.min(...ratings))
    const restRatings = ratings.filter((_, i) => i !== floaterIdx)
    const restOrigIdx = ratings.map((_, i) => i).filter((i) => i !== floaterIdx)
    const [r0, r1] = optimalPartition2(restRatings)
    const team0 = r0.map((i) => restOrigIdx[i])
    const team1 = r1.map((i) => restOrigIdx[i])
    if (Math.random() < 0.5) team0.push(floaterIdx)
    else team1.push(floaterIdx)
    return [team0, team1]
  }

  const half = n / 2

  if (n > 20) {
    // Fallback: snake-draft (fast, good enough for large groups)
    const sorted = ratings.map((r, i) => ({ r, i })).sort((a, b) => b.r - a.r)
    const t0: number[] = [], t1: number[] = []
    sorted.forEach(({ i }, pos) => {
      const round = Math.floor(pos / 2)
      const slot = pos % 2
      ;(round % 2 === 0 ? [t0, t1] : [t1, t0])[slot].push(i)
    })
    return [t0, t1]
  }

  // 2D DP: dp[count][sum] — find subset of exactly `half` players with sum closest to total/2.
  // Enforces equal team sizes.
  const scale = 100
  const ints = ratings.map((r) => Math.round(r * scale))
  const total = ints.reduce((s, v) => s + v, 0)
  const target = Math.floor(total / 2)

  // dp[c][s] = true if we can pick exactly c players with sum s
  // from[c][s] = last player index added to reach (c, s), -1 if unreachable
  const dp: Uint8Array[] = Array.from({ length: half + 1 }, () => new Uint8Array(target + 1))
  const from: Int16Array[] = Array.from({ length: half + 1 }, () => new Int16Array(target + 1).fill(-1))
  dp[0][0] = 1

  for (let i = 0; i < n; i++) {
    const v = ints[i]
    // Iterate backwards to avoid reusing the same player
    for (let c = Math.min(i + 1, half); c >= 1; c--) {
      for (let s = target; s >= v; s--) {
        if (dp[c - 1][s - v] && !dp[c][s]) {
          dp[c][s] = 1
          from[c][s] = i
        }
      }
    }
  }

  // Find reachable sum in dp[half] closest to target
  let bestSum = -1
  for (let d = 0; d <= target; d++) {
    if (dp[half][target - d]) { bestSum = target - d; break }
    if (target + d <= total && dp[half][target + d]) { bestSum = target + d; break }
  }

  if (bestSum < 0) {
    // Should never happen; snake-draft safety net
    const sorted = ratings.map((r, i) => ({ r, i })).sort((a, b) => b.r - a.r)
    const t0: number[] = [], t1: number[] = []
    sorted.forEach(({ i }, pos) => {
      const round = Math.floor(pos / 2)
      const slot = pos % 2
      ;(round % 2 === 0 ? [t0, t1] : [t1, t0])[slot].push(i)
    })
    return [t0, t1]
  }

  // Reconstruct team 0 via backtracking through from[c][s]
  const inTeam0 = new Uint8Array(n)
  let c = half, s = bestSum
  while (c > 0) {
    const pi = from[c][s]
    inTeam0[pi] = 1
    s -= ints[pi]
    c--
  }

  const team0: number[] = [], team1: number[] = []
  for (let i = 0; i < n; i++) {
    inTeam0[i] ? team0.push(i) : team1.push(i)
  }
  return [team0, team1]
}

// ─── Disambiguated first names ────────────────────────────────────────────────
// Given a list of players with a display name and full name, returns
// a Map<playerId, label> where:
// - label is displayName when unique across the pool
// - when two players share the same displayName, surname chars from fullName
//   are added one at a time until unique ("Balle" → "Balle B." → "Steffen Ba.")

export function disambiguateNames(
  players: { id: string; name: string; fullName?: string }[]
): Map<string, string> {
  const parsed = players.map((p) => {
    if (p.fullName) {
      // New API: name = display base (nickname/firstName), fullName = "First Last [...]" for surname
      const clean = p.fullName.replace(/\s*\(.*\)$/, "").trim()
      const parts = clean.split(/\s+/)
      const surname = parts.slice(1).join(" ")
      return { id: p.id, first: p.name, surname }
    } else {
      // Legacy API: name = full name, extract first token as display base
      const clean = p.name.replace(/\s*\(.*\)$/, "").trim()
      const parts = clean.split(/\s+/)
      const first = parts[0] ?? p.name
      const surname = parts.slice(1).join(" ")
      return { id: p.id, first, surname }
    }
  })

  const result = new Map<string, string>()

  for (const p of parsed) {
    const clashes = parsed.filter((q) => q.id !== p.id && q.first === p.first)
    if (clashes.length === 0) {
      result.set(p.id, p.first)
      continue
    }
    let display = p.first
    for (let i = 1; i <= p.surname.length; i++) {
      const candidate = `${p.first} ${p.surname.slice(0, i)}.`
      const stillClashes = clashes.some(
        (q) => `${q.first} ${q.surname.slice(0, i)}.` === candidate
      )
      display = candidate
      if (!stillClashes) break
    }
    result.set(p.id, display)
  }

  return result
}
