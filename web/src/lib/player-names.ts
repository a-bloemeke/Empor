// Builds display names for a set of players:
// - Use nickname if set
// - Otherwise use firstName
// - If two players share the same firstName (or nickname), disambiguate with last name initial
// - If firstName === lastName (import artefact), treat lastName as absent
export function buildPlayerNames(
  players: { id: string; firstName: string; lastName: string | null; nickname: string | null }[],
): Map<string, string> {
  // First pass: determine raw display name per player
  const raw = new Map<string, string>()
  for (const p of players) {
    raw.set(p.id, p.nickname ?? p.firstName)
  }

  // Find conflicts (same display name for different players)
  const nameCounts = new Map<string, number>()
  for (const name of raw.values()) {
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)
  }

  // Second pass: for conflicting names add last name initial
  const result = new Map<string, string>()
  for (const p of players) {
    const base = raw.get(p.id)!
    if ((nameCounts.get(base) ?? 0) > 1) {
      // Add last name initial if lastName is meaningful (not same as firstName)
      const initial = p.lastName && p.lastName !== p.firstName ? p.lastName[0].toUpperCase() : ""
      result.set(p.id, initial ? `${base}${initial}` : base)
    } else {
      result.set(p.id, base)
    }
  }

  return result
}
