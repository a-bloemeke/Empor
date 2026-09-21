import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { buildPlayerNames } from "@/lib/player-names"

export default async function StatsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const t = await getTranslations("stats")

  const seasons = await db.season.findMany({ orderBy: { year: "asc" } })

  const seasonStats = await Promise.all(seasons.map(async (season) => {
    const sessionIds = (await db.session.findMany({
      where: { seasonId: season.id, status: { in: ["COMPLETED", "IN_PROGRESS"] } },
      select: { id: true },
    })).map((s) => s.id)

    const matchIds = sessionIds.length > 0
      ? (await db.match.findMany({ where: { sessionId: { in: sessionIds } }, select: { id: true } })).map((m) => m.id)
      : []

    const [teams, goals, assists] = await Promise.all([
      db.team.count({ where: { sessionId: { in: sessionIds } } }),
      db.goal.count({ where: { matchId: { in: matchIds } } }),
      db.goal.count({ where: { matchId: { in: matchIds }, assistedByPlayerId: { not: null } } }),
    ])

    return { year: season.year, status: season.status, gameDays: sessionIds.length, matches: matchIds.length, teams, goals, assists }
  }))

  const totals = seasonStats.reduce(
    (acc, s) => ({ gameDays: acc.gameDays + s.gameDays, matches: acc.matches + s.matches, teams: acc.teams + s.teams, goals: acc.goals + s.goals, assists: acc.assists + s.assists }),
    { gameDays: 0, matches: 0, teams: 0, goals: 0, assists: 0 }
  )

  // Response speed leaderboard (lifetime)
  const responseRows = await db.playerStatsLifetime.findMany({
    where: { responsePoints: { gt: 0 } },
    select: {
      responsePoints: true,
      player: { select: { id: true, firstName: true, lastName: true, nickname: true } },
    },
    orderBy: { responsePoints: "desc" },
    take: 20,
  })
  const allResponsePlayers = responseRows.map((r) => r.player)
  const responseNames = buildPlayerNames(allResponsePlayers)

  // Age-adjusted performance (lifetime)
  const lifeRows = await db.playerStatsLifetime.findMany({
    where: { sessionsPlayed: { gt: 0 } },
    select: {
      goals: true,
      assists: true,
      points: true,
      player: { select: { id: true, firstName: true, lastName: true, nickname: true, dateOfBirth: true } },
    },
  })
  const allLifePlayers = lifeRows.map((r) => r.player)
  const lifeNames = buildPlayerNames(allLifePlayers)

  const now = new Date()
  const withAge = lifeRows.map((r) => {
    const dob = r.player.dateOfBirth
    const age = dob ? (now.getTime() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000) : null
    return { ...r, age }
  })
  const knownAges = withAge.filter((r) => r.age !== null).map((r) => r.age!)
  const avgAge = knownAges.length > 0 ? knownAges.reduce((a, b) => a + b, 0) / knownAges.length : 30
  const ageRows = withAge.map((r) => {
    const age = r.age ?? avgAge
    const factor = age / avgAge
    const raw = r.goals + r.assists + r.points
    return {
      playerId: r.player.id,
      playerName: lifeNames.get(r.player.id) ?? r.player.firstName,
      age: Math.floor(age),
      hasAge: r.age !== null,
      factor: Math.round(factor * 100) / 100,
      raw,
      adjustedScore: Math.round(raw * factor * 10) / 10,
    }
  }).sort((a, b) => b.adjustedScore - a.adjustedScore)

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-10">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {/* Season overview table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="px-4 py-3 text-left font-semibold">{t("season")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("gameDays")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("matches")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("teams")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("goals")}</th>
              <th className="px-4 py-3 text-right font-semibold">{t("assists")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b font-semibold bg-primary/5">
              <td className="px-4 py-3">{t("total")}</td>
              <td className="px-4 py-3 text-right tabular-nums">{totals.gameDays}</td>
              <td className="px-4 py-3 text-right tabular-nums">{totals.matches}</td>
              <td className="px-4 py-3 text-right tabular-nums">{totals.teams}</td>
              <td className="px-4 py-3 text-right tabular-nums">{totals.goals}</td>
              <td className="px-4 py-3 text-right tabular-nums">{totals.assists}</td>
            </tr>
            {[...seasonStats].reverse().map((s) => (
              <tr key={s.year} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">
                  {s.year}
                  {s.status === "ACTIVE" && (
                    <span className="ml-2 text-xs text-primary font-normal">{t("active")}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{s.gameDays}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.matches}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.teams}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.goals}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.assists}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Response speed leaderboard */}
      <section>
        <h2 className="text-lg font-semibold mb-1">⚡ {t("responseSpeed")}</h2>
        <p className="text-sm text-muted-foreground mb-3">{t("responseSpeedDesc")}</p>
        {responseRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noData")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-4 py-3 text-left font-semibold w-12">{t("rank")}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t("player")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("responsePoints")}</th>
                </tr>
              </thead>
              <tbody>
                {responseRows.map((row, i) => (
                  <tr key={row.player.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">{responseNames.get(row.player.id) ?? row.player.firstName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.responsePoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Age-adjusted performance */}
      <section>
        <h2 className="text-lg font-semibold mb-1">🎂 {t("ageAdjusted")}</h2>
        <p className="text-sm text-muted-foreground mb-3">{t("ageAdjustedDesc")}</p>
        {ageRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noData")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-4 py-3 text-left font-semibold w-12">{t("rank")}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t("player")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("age")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("rawScore")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("ageFactor")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("adjustedScore")}</th>
                </tr>
              </thead>
              <tbody>
                {ageRows.map((row, i) => (
                  <tr key={row.playerId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">{row.playerName}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {row.hasAge ? row.age : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.raw}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">×{row.factor.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{row.adjustedScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
