"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { ChevronUpIcon, ChevronDownIcon, ChevronsUpDownIcon } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getSeasonStats } from "./actions"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

type StatsRow = {
  playerId: string
  playerName: string
  sessionsPlayed: number
  matchesPlayed: number
  goals: number
  assists: number
  score: number
  points: number
  seasonId?: string
}

type Season = { id: string; year: number; status: string }

// ─── Points table ─────────────────────────────────────────────────────────────

function PointsTable({ rows }: { rows: StatsRow[] }) {
  const t = useTranslations("leaderboard")
  const sorted = [...rows].sort((a, b) =>
    b.points !== a.points ? b.points - a.points : b.score - a.score
  )

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{t("noStats")}</p>
  }

  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">{t("rank")}</TableHead>
          <TableHead>{t("player")}</TableHead>
          <TableHead className="text-right hidden sm:table-cell">{t("gameDays")}</TableHead>
          <TableHead className="text-right hidden sm:table-cell">{t("matches")}</TableHead>
          <TableHead className="text-right hidden sm:table-cell">{t("goals")}</TableHead>
          <TableHead className="text-right hidden sm:table-cell">{t("assists")}</TableHead>
          <TableHead className="text-right hidden sm:table-cell">{t("score")}</TableHead>
          <TableHead className="text-right">{t("pts")}</TableHead>
          <TableHead className="text-right">{t("ptsPerGD")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row, i) => (
          <TableRow key={row.playerId}>
            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
            <TableCell>
              <Link href={`/players/${row.playerId}`} className="font-medium hover:underline">
                {row.playerName}
              </Link>
            </TableCell>
            <TableCell className="text-right hidden sm:table-cell">{row.sessionsPlayed}</TableCell>
            <TableCell className="text-right hidden sm:table-cell">{row.matchesPlayed}</TableCell>
            <TableCell className="text-right hidden sm:table-cell">{row.goals}</TableCell>
            <TableCell className="text-right hidden sm:table-cell">{row.assists}</TableCell>
            <TableCell className="text-right hidden sm:table-cell">{row.score}</TableCell>
            <TableCell className="text-right font-semibold">{row.points}</TableCell>
            <TableCell className="text-right text-muted-foreground">
              {row.sessionsPlayed > 0 ? (row.points / row.sessionsPlayed).toFixed(1) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  )
}

// ─── Strength table ───────────────────────────────────────────────────────────

const MIN_GD = 3

function strengthOf(row: StatsRow): number {
  if (row.sessionsPlayed < MIN_GD) return 0
  const outcomePtsPerGD = (row.points - row.sessionsPlayed) / row.sessionsPlayed
  const scorePerGD = row.score / row.sessionsPlayed
  return 0.6 * outcomePtsPerGD + 0.4 * scorePerGD
}

function StrengthTable({ rows, fallbackRows }: { rows: StatsRow[]; fallbackRows?: StatsRow[] }) {
  const t = useTranslations("leaderboard")
  const fallbackById = new Map(fallbackRows?.map((r) => [r.playerId, r]) ?? [])

  const effective: Array<{ row: StatsRow; usingFallback: boolean }> = rows.map((r) => {
    if (r.sessionsPlayed >= MIN_GD) return { row: r, usingFallback: false }
    const fb = fallbackById.get(r.playerId)
    if (fb && fb.sessionsPlayed >= MIN_GD) return { row: fb, usingFallback: true }
    return { row: r, usingFallback: false }
  })

  const qualified = effective.filter(({ row }) => row.sessionsPlayed >= MIN_GD)
  const sorted = [...qualified].sort((a, b) => strengthOf(b.row) - strengthOf(a.row))
  const maxStrength = sorted.length > 0 ? strengthOf(sorted[0].row) || 1 : 1

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{t("notEnoughData", { min: MIN_GD })}</p>
  }

  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">{t("rank")}</TableHead>
          <TableHead>{t("player")}</TableHead>
          <TableHead className="text-right hidden sm:table-cell">{t("gds")}</TableHead>
          <TableHead className="text-right hidden sm:table-cell">{t("ptsPerGD")}</TableHead>
          <TableHead className="text-right hidden sm:table-cell">{t("scorePerGD")}</TableHead>
          <TableHead className="text-right">{t("strength")}</TableHead>
          <TableHead className="w-28 sm:w-36">{t("rating")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map(({ row, usingFallback }, i) => {
          const s = strengthOf(row)
          const pct = Math.round((s / maxStrength) * 100)
          const outcomePtsPerGD = (row.points - row.sessionsPlayed) / row.sessionsPlayed
          const scorePerGD = row.score / row.sessionsPlayed
          return (
            <TableRow key={row.playerId}>
              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Link href={`/players/${row.playerId}`} className="font-medium hover:underline">
                    {row.playerName}
                  </Link>
                  {usingFallback && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60 leading-none">
                      {t("lifetimeBadge")}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right text-muted-foreground hidden sm:table-cell">{row.sessionsPlayed}</TableCell>
              <TableCell className="text-right text-muted-foreground hidden sm:table-cell">{outcomePtsPerGD.toFixed(2)}</TableCell>
              <TableCell className="text-right text-muted-foreground hidden sm:table-cell">{scorePerGD.toFixed(2)}</TableCell>
              <TableCell className="text-right font-bold tabular-nums">{s.toFixed(2)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: `oklch(${0.35 + 0.25 * (pct / 100)} 0.16 150)`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-7 sm:w-8 text-right">{pct}%</span>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
    </div>
  )
}

type SortKey = "goals" | "assists" | "score" | "goalsPerGD" | "assistsPerGD" | "scorePerGD"
type SortDir = "desc" | "asc"

function SortableHead({
  label,
  sortKey,
  current,
  dir,
  onSort,
  extraClass,
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  dir: SortDir
  onSort: (k: SortKey) => void
  extraClass?: string
}) {
  const active = current === sortKey
  return (
    <TableHead
      className={`text-right cursor-pointer select-none hover:text-foreground${extraClass ? ` ${extraClass}` : ""}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center justify-end gap-1">
        {label}
        {active ? (
          dir === "desc" ? <ChevronDownIcon className="size-3.5" /> : <ChevronUpIcon className="size-3.5" />
        ) : (
          <ChevronsUpDownIcon className="size-3.5 opacity-30" />
        )}
      </span>
    </TableHead>
  )
}

function ScorersTable({ rows }: { rows: StatsRow[] }) {
  const t = useTranslations("leaderboard")
  const [sortKey, setSortKey] = useState<SortKey>("goals")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  const perGD = (row: StatsRow, field: "goals" | "assists" | "score") =>
    row.sessionsPlayed > 0 ? row[field] / row.sessionsPlayed : 0

  const sortVal = (row: StatsRow, key: SortKey): number => {
    if (key === "goalsPerGD")   return perGD(row, "goals")
    if (key === "assistsPerGD") return perGD(row, "assists")
    if (key === "scorePerGD")   return perGD(row, "score")
    return row[key]
  }

  const sorted = [...rows].sort((a, b) => {
    const diff = sortDir === "desc" ? sortVal(b, sortKey) - sortVal(a, sortKey) : sortVal(a, sortKey) - sortVal(b, sortKey)
    if (diff !== 0) return diff
    const secondary: SortKey[] = ["score", "goals", "assists"].filter((k) => k !== sortKey) as SortKey[]
    for (const k of secondary) {
      const d = sortVal(b, k) - sortVal(a, k)
      if (d !== 0) return d
    }
    return 0
  })

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{t("noStats")}</p>
  }

  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">{t("rank")}</TableHead>
          <TableHead>{t("player")}</TableHead>
          <SortableHead label={t("goals")}        sortKey="goals"        current={sortKey} dir={sortDir} onSort={handleSort} />
          <SortableHead label={t("assists")}      sortKey="assists"      current={sortKey} dir={sortDir} onSort={handleSort} />
          <SortableHead label={t("score")}        sortKey="score"        current={sortKey} dir={sortDir} onSort={handleSort} />
          <SortableHead label={t("goalsPerGD")}   sortKey="goalsPerGD"   current={sortKey} dir={sortDir} onSort={handleSort} extraClass="hidden sm:table-cell" />
          <SortableHead label={t("assistsPerGD")} sortKey="assistsPerGD" current={sortKey} dir={sortDir} onSort={handleSort} extraClass="hidden sm:table-cell" />
          <SortableHead label={t("scorePerGD")}   sortKey="scorePerGD"   current={sortKey} dir={sortDir} onSort={handleSort} extraClass="hidden sm:table-cell" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row, i) => (
          <TableRow key={row.playerId}>
            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
            <TableCell>
              <Link href={`/players/${row.playerId}`} className="font-medium hover:underline">
                {row.playerName}
              </Link>
            </TableCell>
            <TableCell className="text-right font-semibold">{row.goals}</TableCell>
            <TableCell className="text-right">{row.assists}</TableCell>
            <TableCell className="text-right">{row.score}</TableCell>
            <TableCell className="text-right text-muted-foreground tabular-nums hidden sm:table-cell">
              {row.sessionsPlayed > 0 ? perGD(row, "goals").toFixed(2) : "—"}
            </TableCell>
            <TableCell className="text-right text-muted-foreground tabular-nums hidden sm:table-cell">
              {row.sessionsPlayed > 0 ? perGD(row, "assists").toFixed(2) : "—"}
            </TableCell>
            <TableCell className="text-right text-muted-foreground tabular-nums hidden sm:table-cell">
              {row.sessionsPlayed > 0 ? perGD(row, "score").toFixed(2) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LeaderboardClient({
  seasons,
  currentSeasonId,
  initialSeasonStats,
  lifetimeStats,
}: {
  seasons: Season[]
  currentSeasonId: string | null
  initialSeasonStats: StatsRow[]
  lifetimeStats: StatsRow[]
}) {
  const t = useTranslations("leaderboard")
  const [selectedSeasonId, setSelectedSeasonId] = useState(currentSeasonId ?? seasons[0]?.id ?? "")
  const [seasonStats, setSeasonStats] = useState(initialSeasonStats)
  const [pending, startTransition] = useTransition()

  function handleSeasonChange(id: string) {
    setSelectedSeasonId(id)
    startTransition(async () => {
      try {
        const stats = await getSeasonStats(id)
        setSeasonStats(stats)
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  const selectedSeason = seasons.find((s) => s.id === selectedSeasonId)

  const strengthHeader = (
    <>
      <span>{t("playerStrength")}</span>
      <span className="ml-2 font-normal opacity-70 text-[10px]">{t("strengthFormula", { min: MIN_GD })}</span>
    </>
  )

  const legend = [
    [t("legendGDLabel"), t("legendGD")],
    [t("pts"),      t("legendPts")],
    [t("ptsPerGD"), t("legendPtsPerGD")],
    [t("score"),    t("legendScore")],
    [t("scorePerGD"), t("legendScorePerGD")],
    [t("strength"), t("legendStrength")],
    [t("rating"),   t("legendRating")],
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">{t("title")}</h1>
      <p className="text-muted-foreground mb-6">{t("subtitle")}</p>

      <Tabs defaultValue="season">
        <TabsList className="mb-4">
          <TabsTrigger value="season">{t("season")}</TabsTrigger>
          <TabsTrigger value="lifetime">{t("lifetime")}</TabsTrigger>
        </TabsList>

        <TabsContent value="season" className="space-y-8">
          <div className="flex items-center gap-3">
            <Select value={selectedSeasonId} onValueChange={(v) => { if (v) handleSeasonChange(v) }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t("selectSeason")}>
                  {(v: string) => {
                    const s = seasons.find((s) => s.id === v)
                    return s ? `${s.year}${s.status === "ACTIVE" ? ` ${t("active")}` : ""}` : t("selectSeason")
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.year}{s.status === "ACTIVE" ? ` ${t("active")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSeason && (
              <span className="text-sm text-muted-foreground">{t("season")} {selectedSeason.year}</span>
            )}
          </div>
          {pending ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-border shadow-sm">
                <div className="px-4 py-3 text-white font-bold tracking-wide uppercase text-xs"
                  style={{ background: "linear-gradient(90deg, oklch(0.20 0.07 150), oklch(0.35 0.12 150))" }}
                >{t("pointsRanking")}</div>
                <PointsTable rows={seasonStats} />
              </div>
              <div className="overflow-hidden rounded-xl border border-border shadow-sm">
                <div className="px-4 py-3 text-white font-bold tracking-wide uppercase text-xs"
                  style={{ background: "linear-gradient(90deg, oklch(0.20 0.07 150), oklch(0.35 0.12 150))" }}
                >{t("topScorers")}</div>
                <ScorersTable rows={seasonStats} />
              </div>
              <div className="overflow-hidden rounded-xl border border-border shadow-sm">
                <div className="px-4 py-3 text-white font-bold tracking-wide uppercase text-xs"
                  style={{ background: "linear-gradient(90deg, oklch(0.20 0.07 150), oklch(0.35 0.12 150))" }}
                >{strengthHeader}</div>
                <StrengthTable rows={seasonStats} fallbackRows={lifetimeStats} />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="lifetime" className="space-y-8">
          <div className="overflow-hidden rounded-xl border border-border shadow-sm">
            <div className="px-4 py-3 text-white font-bold tracking-wide uppercase text-xs"
              style={{ background: "linear-gradient(90deg, oklch(0.20 0.07 150), oklch(0.35 0.12 150))" }}
            >{t("pointsRanking")}</div>
            <PointsTable rows={lifetimeStats} />
          </div>
          <div className="overflow-hidden rounded-xl border border-border shadow-sm">
            <div className="px-4 py-3 text-white font-bold tracking-wide uppercase text-xs"
              style={{ background: "linear-gradient(90deg, oklch(0.20 0.07 150), oklch(0.35 0.12 150))" }}
            >{t("topScorers")}</div>
            <ScorersTable rows={lifetimeStats} />
          </div>
          <div className="overflow-hidden rounded-xl border border-border shadow-sm">
            <div className="px-4 py-3 text-white font-bold tracking-wide uppercase text-xs"
              style={{ background: "linear-gradient(90deg, oklch(0.20 0.07 150), oklch(0.35 0.12 150))" }}
            >{strengthHeader}</div>
            <StrengthTable rows={lifetimeStats} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Abbreviation legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground mt-8 border rounded-lg px-4 py-2.5 bg-muted/30">
        {legend.map(([abbr, desc]) => (
          <span key={abbr}>
            <span className="font-semibold text-foreground">{abbr}</span>
            {" — "}{desc}
          </span>
        ))}
      </div>
    </div>
  )
}
