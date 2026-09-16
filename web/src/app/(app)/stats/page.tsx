import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

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

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{t("title")}</h1>

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
    </main>
  )
}
