import { describe, it, expect } from "vitest"
import { computeTournamentAward, computePlayerDeltas, nextTeamNames, disambiguateNames, optimalPartition2 } from "../game-logic"
import type { TeamRef, MatchRef } from "../game-logic"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function team(id: string, playerIds: string[]): TeamRef {
  return { id, playerIds }
}

function match(
  id: string,
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
  roundNumber: number | null = 1,
  goals: MatchRef["goals"] = [],
  homePlayers: string[] = [],
  awayPlayers: string[] = [],
): MatchRef {
  return { id, homeTeamId, awayTeamId, homeScore, awayScore, roundNumber, goals, homePlayers, awayPlayers }
}

// ─── Tournament award ─────────────────────────────────────────────────────────

describe("computeTournamentAward", () => {
  const A = team("A", ["p1", "p2"])
  const B = team("B", ["p3", "p4"])
  const C = team("C", ["p5", "p6"])

  it("awards 6/3/0 for clear 1st/2nd/3rd", () => {
    // A wins both, B beats C, C loses both
    const matches = [
      match("m1", "A", "B", 3, 0), // A wins
      match("m2", "B", "C", 2, 0), // B wins
      match("m3", "A", "C", 2, 0), // A wins
    ]
    const award = computeTournamentAward([A, B, C], matches)
    expect(award.get("A")).toBe(6)
    expect(award.get("B")).toBe(3)
    expect(award.get("C")).toBe(0)
  })

  it("awards 6/6/0 when 1st and 2nd are tied", () => {
    // A and B each win one, lose one, both beat C
    const matches = [
      match("m1", "A", "B", 2, 0), // A wins (3pts)
      match("m2", "B", "C", 2, 0), // B wins (3pts)
      match("m3", "A", "C", 2, 0), // A wins — but now A=6pts, B=3pts
    ]
    // Make A and B tied: each win one against the other, both beat C with same GD
    const tiedMatches = [
      match("m1", "A", "B", 2, 0),  // A 3pts
      match("m2", "B", "A", 2, 0),  // B 3pts — now tied 3:3
      match("m3", "A", "C", 2, 0),  // A 6pts
      match("m4", "B", "C", 2, 0),  // B 6pts — tied 6:6
      match("m5", "C", "A", 0, 0), // tie
      match("m6", "C", "B", 0, 0), // tie
    ]
    const award = computeTournamentAward([A, B, C], tiedMatches)
    expect(award.get("A")).toBe(6)
    expect(award.get("B")).toBe(6)
    expect(award.get("C")).toBe(0)
  })

  it("awards 6/3/3 when 2nd and 3rd are tied", () => {
    // A clearly 1st. B and C tied for 2nd.
    const matches = [
      match("m1", "A", "B", 3, 0), // A 3pts
      match("m2", "A", "C", 3, 0), // A 6pts
      match("m3", "B", "C", 1, 1), // B 1pt, C 1pt — both tied at 1pt, same GD
    ]
    const award = computeTournamentAward([A, B, C], matches)
    expect(award.get("A")).toBe(6)
    expect(award.get("B")).toBe(3)
    expect(award.get("C")).toBe(3)
  })

  it("awards 3/3/3 when all teams are tied", () => {
    // Classic three-way tie: each team wins one, same GD
    const matches = [
      match("m1", "A", "B", 2, 0), // A wins
      match("m2", "B", "C", 2, 0), // B wins
      match("m3", "C", "A", 2, 0), // C wins
    ]
    const award = computeTournamentAward([A, B, C], matches)
    expect(award.get("A")).toBe(3)
    expect(award.get("B")).toBe(3)
    expect(award.get("C")).toBe(3)
  })

  it("uses goal difference as tiebreaker before placement tie", () => {
    // A and B both on 3pts but different GD → no tie award
    const matches = [
      match("m1", "A", "C", 3, 0), // A +3 GD
      match("m2", "B", "C", 1, 0), // B +1 GD
      match("m3", "A", "B", 0, 0), // draw
    ]
    const award = computeTournamentAward([A, B, C], matches)
    expect(award.get("A")).toBe(6)
    expect(award.get("B")).toBe(3)
  })

  it("returns empty map for non-3-team input", () => {
    const award = computeTournamentAward([A, B], [match("m1", "A", "B", 1, 0)])
    expect(award.size).toBe(0)
  })
})

// ─── Player deltas ────────────────────────────────────────────────────────────

describe("computePlayerDeltas", () => {
  const teamA = team("A", ["p1", "p2"])
  const teamB = team("B", ["p3", "p4"])

  describe("2-team normal matches", () => {
    it("awards 3pts to winners, 0 to losers", () => {
      const matches = [
        match("m1", "A", "B", 2, 0, null, [], ["p1", "p2"], ["p3", "p4"]),
      ]
      const deltas = computePlayerDeltas([teamA, teamB], matches, "all")
      const p1 = deltas.find((d) => d.playerId === "p1")!
      const p3 = deltas.find((d) => d.playerId === "p3")!
      expect(p1.points).toBe(4)  // 3 win + 1 participation
      expect(p3.points).toBe(1)  // 0 match + 1 participation
    })

    it("awards 1pt each on draw", () => {
      const matches = [
        match("m1", "A", "B", 1, 1, null, [], ["p1", "p2"], ["p3", "p4"]),
      ]
      const deltas = computePlayerDeltas([teamA, teamB], matches, "all")
      deltas.forEach((d) => expect(d.points).toBe(2))  // 1 draw + 1 participation
    })

    it("counts goals and assists correctly", () => {
      const matches = [
        match("m1", "A", "B", 2, 0, null, [
          { scoredByPlayerId: "p1", assistedByPlayerId: "p2" },
          { scoredByPlayerId: "p1", assistedByPlayerId: null },
        ], ["p1", "p2"], ["p3", "p4"]),
      ]
      const deltas = computePlayerDeltas([teamA, teamB], matches, "all")
      const p1 = deltas.find((d) => d.playerId === "p1")!
      const p2 = deltas.find((d) => d.playerId === "p2")!
      expect(p1.goals).toBe(2)
      expect(p1.assists).toBe(0)
      expect(p2.goals).toBe(0)
      expect(p2.assists).toBe(1)
    })
  })

  describe("pointsScope", () => {
    const teamC = team("C", ["p5", "p6"])
    const tournamentMatches: MatchRef[] = [
      match("t1", "A", "B", 2, 0, 1, [], ["p1", "p2"], ["p3", "p4"]),
      match("t2", "B", "C", 2, 0, 1, [], ["p3", "p4"], ["p5", "p6"]),
      match("t3", "A", "C", 2, 0, 1, [], ["p1", "p2"], ["p5", "p6"]),
    ]
    const normalMatches: MatchRef[] = [
      match("n1", "A", "B", 2, 0, null, [], ["p1", "p2"], ["p3", "p4"]),
    ]
    const allMatches = [...tournamentMatches, ...normalMatches]

    it("scope=none awards only participation point, still tracks goals", () => {
      const matches = [
        match("m1", "A", "B", 2, 0, null, [
          { scoredByPlayerId: "p1", assistedByPlayerId: null },
        ], ["p1", "p2"], ["p3", "p4"]),
      ]
      const deltas = computePlayerDeltas([teamA, teamB], matches, "none")
      const p1 = deltas.find((d) => d.playerId === "p1")!
      expect(p1.points).toBe(1)  // participation only
      expect(p1.goals).toBe(1)
    })

    it("scope=tournament ignores normal matches for points", () => {
      const deltas = computePlayerDeltas([teamA, teamB, teamC], allMatches, "tournament")
      const p1 = deltas.find((d) => d.playerId === "p1")!  // team A — 1st
      const p3 = deltas.find((d) => d.playerId === "p3")!  // team B — 2nd
      const p5 = deltas.find((d) => d.playerId === "p5")!  // team C — 3rd
      expect(p1.points).toBe(7)  // 6 tournament 1st + 1 participation
      expect(p3.points).toBe(4)  // 3 tournament 2nd + 1 participation
      expect(p5.points).toBe(1)  // 0 tournament 3rd + 1 participation
    })

    it("scope=normal ignores tournament matches for points", () => {
      const deltas = computePlayerDeltas([teamA, teamB, teamC], allMatches, "normal")
      const p1 = deltas.find((d) => d.playerId === "p1")!  // team A wins normal match
      const p3 = deltas.find((d) => d.playerId === "p3")!  // team B loses normal match
      expect(p1.points).toBe(4)  // 3 normal win + 1 participation
      expect(p3.points).toBe(1)  // 0 normal loss + 1 participation
    })

    it("scope=all combines tournament placement + normal win points", () => {
      const deltas = computePlayerDeltas([teamA, teamB, teamC], allMatches, "all")
      const p1 = deltas.find((d) => d.playerId === "p1")!  // 6 (tournament 1st) + 3 (normal win) + 1 (participation) = 10
      expect(p1.points).toBe(10)
    })
  })
})

// ─── Name disambiguation ──────────────────────────────────────────────────────
// Helper: simulate how the app calls disambiguateNames —
// name = displayName (nickname or firstName), fullName = full "First Last" string

describe("disambiguateNames", () => {
  it("returns display name unchanged when all display names are unique", () => {
    const players = [
      { id: "1", name: "Steffen", fullName: "Steffen Baltz" },
      { id: "2", name: "Andreas", fullName: "Andreas Blömeke" },
      { id: "3", name: "Robert",  fullName: "Robert Carus" },
    ]
    const map = disambiguateNames(players)
    expect(map.get("1")).toBe("Steffen")
    expect(map.get("2")).toBe("Andreas")
    expect(map.get("3")).toBe("Robert")
  })

  it("adds one surname initial when display names clash", () => {
    const players = [
      { id: "1", name: "Steffen", fullName: "Steffen Baltz" },
      { id: "2", name: "Steffen", fullName: "Steffen Winkler" },
      { id: "3", name: "Robert",  fullName: "Robert Carus" },
    ]
    const map = disambiguateNames(players)
    expect(map.get("1")).toBe("Steffen B.")
    expect(map.get("2")).toBe("Steffen W.")
    expect(map.get("3")).toBe("Robert")
  })

  it("adds more surname chars when one initial is still ambiguous", () => {
    const players = [
      { id: "1", name: "Robert", fullName: "Robert Carus" },
      { id: "2", name: "Robert", fullName: "Robert Cuno" },
    ]
    const map = disambiguateNames(players)
    expect(map.get("1")).toBe("Robert Ca.")
    expect(map.get("2")).toBe("Robert Cu.")
  })

  it("disambiguates by nickname when two players share the same nickname", () => {
    const players = [
      { id: "1", name: "Balle", fullName: "Steffen Baltz" },
      { id: "2", name: "Balle", fullName: "Hans Bauer" },
    ]
    const map = disambiguateNames(players)
    // "Balle B." clashes (both B), "Balle Ba." clashes (both Ba),
    // "Balle Bal." vs "Balle Bau." are unique
    expect(map.get("1")).toBe("Balle Bal.")
    expect(map.get("2")).toBe("Balle Bau.")
  })

  it("strips nickname parens from fullName when used as fallback", () => {
    // When fullName contains "(nickname)", surname extraction still works
    const players = [
      { id: "1", name: "Simi", fullName: "Heiko Simon (Simi)" },
      { id: "2", name: "Robert", fullName: "Robert Simon" },
    ]
    const map = disambiguateNames(players)
    expect(map.get("1")).toBe("Simi")    // unique display name
    expect(map.get("2")).toBe("Robert")
  })

  it("handles players with only a first name (no surname)", () => {
    const players = [
      { id: "1", name: "Jörn", fullName: "Jörn" },
      { id: "2", name: "William", fullName: "William" },
    ]
    const map = disambiguateNames(players)
    expect(map.get("1")).toBe("Jörn")
    expect(map.get("2")).toBe("William")
  })

  it("legacy: full name as name only (no fullName) still works", () => {
    // Old call sites that pass full name as name without fullName
    const players = [
      { id: "1", name: "Steffen Baltz" },
      { id: "2", name: "Steffen Winkler" },
    ]
    const map = disambiguateNames(players)
    expect(map.get("1")).toBe("Steffen B.")
    expect(map.get("2")).toBe("Steffen W.")
  })
})


describe("optimalPartition2", () => {
  const sum = (ratings: number[], idxs: number[]) => idxs.reduce((s, i) => s + ratings[i], 0)

  it("splits evenly when possible", () => {
    const ratings = [1, 2, 3, 4]
    const [t0, t1] = optimalPartition2(ratings)
    expect(Math.abs(sum(ratings, t0) - sum(ratings, t1))).toBe(0)
  })

  it("always produces equal-size teams for even player counts", () => {
    const ratings = [1, 2, 3, 4]
    const [t0, t1] = optimalPartition2(ratings)
    expect(t0.length).toBe(2)
    expect(t1.length).toBe(2)
  })

  it("produces teams of size k and k+1 for odd player counts", () => {
    const ratings = [5, 4, 3, 2, 1]
    const [t0, t1] = optimalPartition2(ratings)
    expect(t0.length + t1.length).toBe(5)
    expect(Math.abs(t0.length - t1.length)).toBe(1)
  })

  it("minimises rating difference for odd group (5 players, best equal split then floater)", () => {
    // 4 even players: [5,4,3,2] → teams of [5,2]=7 and [4,3]=7, floater=1 added to one side
    const ratings = [5, 4, 3, 2, 1]
    const [t0, t1] = optimalPartition2(ratings)
    // After optimal even split the difference from floater should be at most 2 (floater value)
    expect(Math.abs(sum(ratings, t0) - sum(ratings, t1))).toBeLessThanOrEqual(2)
  })

  it("handles top-heavy ratings better than snake-draft", () => {
    const ratings = [10, 9, 1, 1, 1, 1]  // 6 players; optimal even split: [10,1,1]=12 vs [9,1,1]=11
    const [t0, t1] = optimalPartition2(ratings)
    expect(t0.length).toBe(3)
    expect(t1.length).toBe(3)
    expect(Math.abs(sum(ratings, t0) - sum(ratings, t1))).toBeLessThanOrEqual(1)
  })

  it("covers all players exactly once for even count", () => {
    const ratings = [3, 1, 4, 1, 5, 9, 2, 6]
    const [t0, t1] = optimalPartition2(ratings)
    expect([...t0, ...t1].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it("covers all players exactly once for odd count", () => {
    const ratings = [3, 1, 4, 1, 5, 9, 2]
    const [t0, t1] = optimalPartition2(ratings)
    expect([...t0, ...t1].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it("equal-size teams for 8 even players (was the reported 3 vs 5 bug case)", () => {
    const ratings = [8, 7, 6, 5, 4, 3, 2, 1]
    const [t0, t1] = optimalPartition2(ratings)
    expect(t0.length).toBe(4)
    expect(t1.length).toBe(4)
  })

  it("9 players produce 4+5 split with lowest player as floater", () => {
    const ratings = [9, 8, 7, 6, 5, 4, 3, 2, 1]
    const [t0, t1] = optimalPartition2(ratings)
    expect(t0.length + t1.length).toBe(9)
    expect(Math.abs(t0.length - t1.length)).toBe(1)
    // floater (player with rating 1) must be on the larger team
    const floaterIdx = ratings.indexOf(1)
    const largerTeam = t0.length > t1.length ? t0 : t1
    expect(largerTeam).toContain(floaterIdx)
  })
})


describe("nextTeamNames", () => {
  it("returns Team A/B for empty existing names (2-team)", () => {
    expect(nextTeamNames([], 2)).toEqual(["Team A", "Team B"])
  })

  it("returns Team A/B/C for empty existing names (3-team)", () => {
    expect(nextTeamNames([], 3)).toEqual(["Team A", "Team B", "Team C"])
  })

  it("advances to C/D after A/B exist (2-team)", () => {
    expect(nextTeamNames(["Team A", "Team B"], 2)).toEqual(["Team C", "Team D"])
  })

  it("advances to D/E/F after A/B/C exist (3-team)", () => {
    expect(nextTeamNames(["Team A", "Team B", "Team C"], 3)).toEqual(["Team D", "Team E", "Team F"])
  })

  it("skips any set that partially overlaps existing names", () => {
    // C exists but not D — C/D set is still excluded because C is taken
    expect(nextTeamNames(["Team C"], 2)).toEqual(["Team A", "Team B"])
  })

  it("handles multiple sequential games", () => {
    const names1 = nextTeamNames([], 2)                          // A/B
    const names2 = nextTeamNames(names1, 2)                      // C/D
    const names3 = nextTeamNames([...names1, ...names2], 2)      // E/F
    expect(names1).toEqual(["Team A", "Team B"])
    expect(names2).toEqual(["Team C", "Team D"])
    expect(names3).toEqual(["Team E", "Team F"])
  })
})
