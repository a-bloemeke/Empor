import { describe, it, expect, vi } from "vitest"

// Mock db so the module loads without a real database connection
vi.mock("@/lib/db", () => ({ db: {} }))

import { filterBundleToSeason } from "../export-data"
import type { ExportBundle } from "../export-data"

function baseBundle(): ExportBundle {
  return {
    exportedAt: "2026-01-01T00:00:00Z",
    version: 2,
    scope: "all",
    players: [
      { email: "a@x.com", firstName: "Alice", lastName: "A", nickname: null, dateOfBirth: null, addressStreet: null, addressCity: null, addressPostalCode: null, role: "PLAYER" },
    ],
    seasons: [
      { year: 2025, status: "COMPLETED" },
      { year: 2026, status: "ACTIVE" },
    ],
    sessions: [
      { seasonYear: 2025, date: "2025-06-01T18:00:00Z", status: "COMPLETED", organizerEmail: "a@x.com" },
      { seasonYear: 2026, date: "2026-06-01T18:00:00Z", status: "COMPLETED", organizerEmail: "a@x.com" },
    ],
    registrations: [
      { sessionDate: "2025-06-01T18:00:00Z", playerEmail: "a@x.com", status: "REGISTERED", registeredAt: "2025-06-01T10:00:00Z", cancelledAt: null, registeredByEmail: "a@x.com" },
      { sessionDate: "2026-06-01T18:00:00Z", playerEmail: "a@x.com", status: "REGISTERED", registeredAt: "2026-06-01T10:00:00Z", cancelledAt: null, registeredByEmail: "a@x.com" },
    ],
    teams: [
      { sessionDate: "2025-06-01T18:00:00Z", name: "Team A", playerEmails: ["a@x.com"] },
      { sessionDate: "2026-06-01T18:00:00Z", name: "Team A", playerEmails: ["a@x.com"] },
    ],
    matches: [
      { sessionDate: "2025-06-01T18:00:00Z", roundNumber: null, homeTeam: "Team A", awayTeam: "Team B", homeScore: 2, awayScore: 1, status: "COMPLETED", endCondition: "GOALS", startedAt: null, endedAt: null },
      { sessionDate: "2026-06-01T18:00:00Z", roundNumber: null, homeTeam: "Team A", awayTeam: "Team B", homeScore: 3, awayScore: 0, status: "COMPLETED", endCondition: "GOALS", startedAt: null, endedAt: null },
    ],
    goals: [
      { sessionDate: "2025-06-01T18:00:00Z", roundNumber: null, homeTeam: "Team A", awayTeam: "Team B", scorerEmail: "a@x.com", assisterEmail: null, teamName: "Team A", scoredAt: "2025-06-01T18:05:00Z" },
      { sessionDate: "2026-06-01T18:00:00Z", roundNumber: null, homeTeam: "Team A", awayTeam: "Team B", scorerEmail: "a@x.com", assisterEmail: null, teamName: "Team A", scoredAt: "2026-06-01T18:05:00Z" },
    ],
    fees: [
      { playerEmail: "a@x.com", year: 2025, status: "PAID", paidAt: "2025-01-15T00:00:00Z", recordedByEmail: "a@x.com" },
      { playerEmail: "a@x.com", year: 2026, status: "NOT_PAID", paidAt: null, recordedByEmail: "a@x.com" },
    ],
    seasonStats: [
      { playerEmail: "a@x.com", seasonYear: 2025, sessionsPlayed: 1, matchesPlayed: 1, goals: 1, assists: 0, score: 1, points: 3 },
      { playerEmail: "a@x.com", seasonYear: 2026, sessionsPlayed: 1, matchesPlayed: 1, goals: 1, assists: 0, score: 1, points: 3 },
    ],
    lifetimeStats: [
      { playerEmail: "a@x.com", sessionsPlayed: 2, matchesPlayed: 2, goals: 2, assists: 0, score: 2, points: 6 },
    ],
  }
}

describe("filterBundleToSeason", () => {
  it("sets scope to 'season' and records seasonYear", () => {
    const result = filterBundleToSeason(baseBundle(), 2025)
    expect(result.scope).toBe("season")
    expect(result.seasonYear).toBe(2025)
  })

  it("keeps only the target season", () => {
    const result = filterBundleToSeason(baseBundle(), 2025)
    expect(result.seasons).toHaveLength(1)
    expect(result.seasons[0].year).toBe(2025)
  })

  it("keeps all players (they span seasons)", () => {
    const result = filterBundleToSeason(baseBundle(), 2025)
    expect(result.players).toHaveLength(1)
  })

  it("filters sessions to the target season only", () => {
    const result = filterBundleToSeason(baseBundle(), 2025)
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0].seasonYear).toBe(2025)
  })

  it("filters registrations, teams, matches, goals to target season sessions", () => {
    const result = filterBundleToSeason(baseBundle(), 2025)
    expect(result.registrations).toHaveLength(1)
    expect(result.teams).toHaveLength(1)
    expect(result.matches).toHaveLength(1)
    expect(result.goals).toHaveLength(1)
    expect(result.matches[0].homeScore).toBe(2)
  })

  it("filters fees to target year", () => {
    const result = filterBundleToSeason(baseBundle(), 2025)
    expect(result.fees).toHaveLength(1)
    expect(result.fees[0].year).toBe(2025)
  })

  it("filters season stats to target season", () => {
    const result = filterBundleToSeason(baseBundle(), 2025)
    expect(result.seasonStats).toHaveLength(1)
    expect(result.seasonStats[0].seasonYear).toBe(2025)
  })

  it("omits lifetime stats (season-scoped import never touches them)", () => {
    const result = filterBundleToSeason(baseBundle(), 2025)
    expect(result.lifetimeStats).toBeUndefined()
  })

  it("throws a helpful error if the season is not in the bundle", () => {
    expect(() => filterBundleToSeason(baseBundle(), 2024))
      .toThrowError(/2024.*not found/i)
  })

  it("includes which years ARE available in the error message", () => {
    expect(() => filterBundleToSeason(baseBundle(), 2024))
      .toThrowError(/2025/)
  })
})
