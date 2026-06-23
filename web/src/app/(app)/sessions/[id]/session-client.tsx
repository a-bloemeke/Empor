"use client"

import React, { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
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
import {
  addRegistration,
  addRegistrationBulk,
  addGuestAndRegister,
  removeRegistration,
  generateTeams,
  startMatch,
  recordGoal,
  undoLastGoal,
  deleteGoal,
  endMatch,
  startNextRound,
  endSession,
  reopenMatch,
  reopenSession,
  addRematch,
  addNewMatch,
  deleteTeam,
} from "./actions"
import type { PointsScope } from "@/lib/types"
import { toast } from "sonner"
import { SportsTable } from "@/components/app/sports-table"
import { disambiguateNames, nextTeamNames, optimalPartition2 } from "@/lib/game-logic"

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = { id: string; name: string; displayName: string; seasonPoints: number; seasonRank: number | null }
type Goal = {
  id: string
  scoredByPlayerId: string
  scoredByName: string
  assistedByPlayerId: string | null
  assistedByName: string | null
  teamId: string
  scoredAt: string
}
type Match = {
  id: string
  roundNumber: number | null
  homeTeamId: string
  homeTeamName: string
  awayTeamId: string
  awayTeamName: string
  homeScore: number
  awayScore: number
  status: string
  endCondition: string | null
  startedAt: string | null
  goals: Goal[]
}
type Team = { id: string; name: string; players: Player[] }
type Registration = {
  playerId: string
  playerName: string
  status: string
  seasonPoints: number
  seasonSessions: number
  seasonScore: number
  lifetimePoints: number
  lifetimeSessions: number
  lifetimeScore: number
}
type SessionData = {
  id: string
  date: string
  status: string
  seasonYear: number
  registrations: Registration[]
  teams: Team[]
  matches: Match[]
  allPlayers: Player[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function playerInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}

function computeStandings(teams: Team[], matches: Match[]) {
  const stats = new Map<string, { name: string; pts: number; gf: number; ga: number; played: number }>()
  for (const t of teams) stats.set(t.id, { name: t.name, pts: 0, gf: 0, ga: 0, played: 0 })
  for (const m of matches) {
    if (m.status !== "COMPLETED") continue
    const h = stats.get(m.homeTeamId)!
    const a = stats.get(m.awayTeamId)!
    h.played++; a.played++
    h.gf += m.homeScore; h.ga += m.awayScore
    a.gf += m.awayScore; a.ga += m.homeScore
    if (m.homeScore > m.awayScore) { h.pts += 3 }
    else if (m.homeScore < m.awayScore) { a.pts += 3 }
    else { h.pts += 1; a.pts += 1 }
  }
  return [...stats.values()].sort((a, b) => {
    if (a.pts !== b.pts) return b.pts - a.pts
    const gdDiff = (b.gf - b.ga) - (a.gf - a.ga)
    if (gdDiff !== 0) return gdDiff
    return b.gf - a.gf
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RegistrationPanel({
  session,
  isOrganizer,
}: {
  session: SessionData
  isOrganizer: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [actionId, setActionId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [guestName, setGuestName] = useState("")

  const registered = session.registrations.filter((r) => r.status === "REGISTERED")
  const registeredIds = new Set(registered.map((r) => r.playerId))
  const available = session.allPlayers.filter((p) => !registeredIds.has(p.id))

  function handleAddGuest() {
    if (!guestName.trim()) return
    startTransition(async () => {
      try {
        await addGuestAndRegister(session.id, guestName.trim())
        setGuestName("")
        toast.success(`Guest "${guestName.trim()}" added.`)
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleRemove(playerId: string) {
    setActionId(playerId)
    startTransition(async () => {
      try {
        await removeRegistration(session.id, playerId)
        toast.success("Player removed.")
      } catch (e) { toast.error((e as Error).message) }
      finally { setActionId(null) }
    })
  }

  function togglePlayer(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === available.length ? new Set() : new Set(available.map((p) => p.id))
    )
  }

  function handleAddBulk() {
    if (selected.size === 0) return
    startTransition(async () => {
      try {
        await addRegistrationBulk(session.id, [...selected])
        toast.success(`${selected.size} player${selected.size > 1 ? "s" : ""} registered.`)
        setSelected(new Set())
        setAddOpen(false)
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Registered players ({registered.length})</CardTitle>
          {isOrganizer && available.length > 0 && (
            <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setSelected(new Set()) }}>
              <DialogTrigger render={<Button size="sm" variant="outline" />}>Add players</DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Add players</DialogTitle>
                </DialogHeader>
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  <label className="flex items-center gap-2 text-sm py-1 cursor-pointer select-none border-b pb-2 mb-1">
                    <input
                      type="checkbox"
                      checked={selected.size === available.length}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border"
                    />
                    <span className="font-medium">Select all ({available.length})</span>
                  </label>
                  {available.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer select-none hover:bg-muted/50 rounded px-1">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => togglePlayer(p.id)}
                        className="h-4 w-4 rounded border"
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
                <DialogFooter>
                  <Button onClick={handleAddBulk} disabled={pending || selected.size === 0}>
                    {pending ? "Adding…" : `Add ${selected.size > 0 ? selected.size : ""} player${selected.size !== 1 ? "s" : ""}`}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {registered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No players registered yet.</p>
        ) : (
          <ul className="space-y-1">
            {registered.map((r, i) => (
              <li key={r.playerId} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
                <span className="flex-1">{r.playerName}</span>
                {isOrganizer && (
                  <button
                    className="text-muted-foreground hover:text-destructive"
                    disabled={pending && actionId === r.playerId}
                    onClick={() => handleRemove(r.playerId)}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {isOrganizer && (
          <div className="flex items-center gap-2 pt-2 border-t border-border/50 mt-2">
            <Input
              placeholder="Guest name (e.g. Thomas)…"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddGuest() }}
              className="flex-1 h-8 text-sm"
            />
            <Button size="sm" variant="outline" disabled={!guestName.trim() || pending} onClick={handleAddGuest}>
              Add guest
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Team-formation preview helpers ──────────────────────────────────────────

function playerRating(r: Registration, metric: "points" | "strength"): number {
  // Use season stats if enough data, else lifetime
  const MIN = 3
  const pts = r.seasonSessions >= MIN ? r.seasonPoints : r.lifetimePoints
  const sessions = r.seasonSessions >= MIN ? r.seasonSessions : r.lifetimeSessions
  const score = r.seasonSessions >= MIN ? r.seasonScore : r.lifetimeScore
  if (sessions === 0) return 0
  if (metric === "points") return pts / sessions
  // strength = 0.6 × outcomePtsPerGD + 0.4 × scorePerGD
  const outcomePtsPerGD = (pts - sessions) / sessions
  const scorePerGD = score / sessions
  return 0.6 * outcomePtsPerGD + 0.4 * scorePerGD
}

function snakeDraft(players: Registration[], numTeams: number): Registration[][] {
  const slots: Registration[][] = Array.from({ length: numTeams }, () => [])
  players.forEach((p, i) => {
    const round = Math.floor(i / numTeams)
    const pos = i % numTeams
    slots[round % 2 === 0 ? pos : numTeams - 1 - pos].push(p)
  })
  return slots
}

function buildSplit(registered: Registration[], numTeams: number, metric: "points" | "strength"): Registration[][] {
  const sorted = [...registered].sort((a, b) => playerRating(b, metric) - playerRating(a, metric))
  return snakeDraft(sorted, numTeams)
}

function SplitPreview({
  split,
  metric,
  otherSplit,
}: {
  split: Registration[][]
  metric: "points" | "strength"
  otherSplit: Registration[][]
}) {
  const teamNames = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const otherById = new Map(otherSplit.flatMap((team, ti) => team.map((p) => [p.playerId, ti])))

  return (
    <div className="space-y-3">
      {split.map((team, ti) => {
        const total = team.reduce((s, p) => s + playerRating(p, metric), 0)
        return (
          <div key={ti} className="rounded-lg border border-border/60 overflow-hidden">
            <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white flex justify-between"
              style={{ background: "oklch(0.30 0.10 150)" }}
            >
              <span>Team {teamNames[ti]}</span>
              <span className="opacity-80">{metric === "points" ? "Pts/GD" : "Strength"} ∑ {total.toFixed(1)}</span>
            </div>
            <ul className="divide-y divide-border/40">
              {team.map((p) => {
                const otherTeam = otherById.get(p.playerId)
                const moved = otherTeam !== undefined && otherTeam !== ti
                const rating = playerRating(p, metric)
                return (
                  <li key={p.playerId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <span className="flex-1">{p.playerName}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{rating.toFixed(2)}</span>
                    {moved && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700/40 leading-none">
                        ↔ {teamNames[otherTeam!]}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

// ─── New Match Dialog — preview teams before committing ──────────────────────

type NewMatchMode = "RANDOM" | "BALANCED" | "STRENGTH"

function buildNewMatchSplit(registered: Registration[], mode: NewMatchMode): Registration[][] {
  const ratingOf = (p: Registration) =>
    p.lifetimeSessions > 0 ? p.lifetimePoints / p.lifetimeSessions : 0
  const strengthOf = (p: Registration) => {
    if (p.lifetimeSessions === 0) return 0
    const outcomePtsPerGD = (p.lifetimePoints - p.lifetimeSessions) / p.lifetimeSessions
    const scorePerGD = p.lifetimeScore / p.lifetimeSessions
    return 0.6 * outcomePtsPerGD + 0.4 * scorePerGD
  }

  if (mode === "BALANCED") {
    const ratings = registered.map((p) => ratingOf(p))
    const [idx0, idx1] = optimalPartition2(ratings)
    return [idx0.map((i) => registered[i]), idx1.map((i) => registered[i])]
  }
  if (mode === "STRENGTH") {
    const ratings = registered.map((p) => strengthOf(p))
    const [idx0, idx1] = optimalPartition2(ratings)
    return [idx0.map((i) => registered[i]), idx1.map((i) => registered[i])]
  }
  // RANDOM: snake-draft after shuffle
  const ordered = [...registered].sort(() => Math.random() - 0.5)
  const slots: Registration[][] = [[], []]
  ordered.forEach((p, i) => {
    const round = Math.floor(i / 2)
    const pos = i % 2
    slots[round % 2 === 0 ? pos : 1 - pos].push(p)
  })
  return slots
}

function NewMatchDialog({ session, disabled }: { session: SessionData; disabled: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState<NewMatchMode>("RANDOM")
  const [seed, setSeed] = useState(0)

  const registered = session.registrations.filter((r) => r.status === "REGISTERED")
  const existingNames = session.teams.map((t) => t.name)
  const [nameHome, nameAway] = nextTeamNames(existingNames, 2)
  const shortNames = disambiguateNames(registered.map((r) => ({ id: r.playerId, name: r.playerName })))

  const split = React.useMemo(
    () => buildNewMatchSplit(registered, mode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, seed, mode]
  )

  const ratingLabel = (p: Registration) => {
    if (mode === "STRENGTH" && p.lifetimeSessions > 0) {
      const outcomePtsPerGD = (p.lifetimePoints - p.lifetimeSessions) / p.lifetimeSessions
      const scorePerGD = p.lifetimeScore / p.lifetimeSessions
      return (0.6 * outcomePtsPerGD + 0.4 * scorePerGD).toFixed(2)
    }
    if (mode === "BALANCED" && p.lifetimeSessions > 0) {
      return (p.lifetimePoints / p.lifetimeSessions).toFixed(2) + " pts/GD"
    }
    return null
  }

  function handleConfirm() {
    startTransition(async () => {
      try {
        await addNewMatch(session.id, mode)
        toast.success("New match created.")
        setOpen(false)
        router.refresh()
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" disabled={disabled} />}>
        New Match
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Match — choose formation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Mode picker */}
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: "RANDOM",   label: "Random",   desc: "Shuffle players" },
              { value: "BALANCED", label: "By Points", desc: "Balance by Pts/GD" },
              { value: "STRENGTH", label: "By Strength", desc: "Balance by Strength" },
            ] as { value: NewMatchMode; label: string; desc: string }[]).map(({ value, label, desc }) => (
              <button
                key={value}
                onClick={() => setMode(value)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  mode === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/40 hover:bg-muted/50"
                }`}
              >
                <div className="text-xs font-semibold">{label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{desc}</div>
              </button>
            ))}
          </div>

          {/* Team preview */}
          <div className="space-y-2">
            {[split[0], split[1]].map((team, ti) => (
              <div key={ti} className="rounded-lg border border-border/60 overflow-hidden">
                <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white"
                  style={{ background: "oklch(0.30 0.10 150)" }}
                >
                  {ti === 0 ? nameHome : nameAway}
                </div>
                <ul className="divide-y divide-border/40">
                  {team.map((p) => (
                    <li key={p.playerId} className="px-3 py-1.5 text-sm flex items-center justify-between">
                      <span>{shortNames.get(p.playerId) ?? p.playerName}</span>
                      {ratingLabel(p) && (
                        <span className="text-xs text-muted-foreground tabular-nums">{ratingLabel(p)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          {mode === "RANDOM" && (
            <Button variant="ghost" disabled={pending} onClick={() => setSeed((s) => s + 1)}>
              ↺ Shuffle again
            </Button>
          )}
          <Button disabled={pending} onClick={handleConfirm}>
            {pending ? "Creating…" : "Start with these teams"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FormTeamsDialog({ session }: { session: SessionData }) {
  const [open, setOpen] = useState(false)
  const [numTeams, setNumTeams] = useState<"2" | "3">("2")
  const [mode, setMode] = useState<"RANDOM" | "BALANCED">("RANDOM")
  const [pending, startTransition] = useTransition()

  function handleGenerate() {
    startTransition(async () => {
      try {
        await generateTeams(session.id, parseInt(numTeams) as 2 | 3, mode)
        toast.success("Teams generated.")
        setOpen(false)
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  const registered = session.registrations.filter((r) => r.status === "REGISTERED")
  const n = parseInt(numTeams) as 2 | 3

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Form Teams</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Form Teams</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="space-y-1.5">
              <Label>Number of teams</Label>
              <Select value={numTeams} onValueChange={(v) => { if (v) setNumTeams(v as "2" | "3") }}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 teams</SelectItem>
                  <SelectItem value="3">3 teams</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Formation mode</Label>
              <Select value={mode} onValueChange={(v) => { if (v) setMode(v as "RANDOM" | "BALANCED") }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RANDOM">Random</SelectItem>
                  <SelectItem value="BALANCED">Balanced</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {mode === "BALANCED" ? "Teams balanced by average points per game day." : "Players distributed randomly."}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {registered.length} registered players → ~{Math.floor(registered.length / n)}–{Math.ceil(registered.length / n)} per team.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={handleGenerate} disabled={pending}>
            {pending ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TeamsView({
  session,
  isOrganizer,
  canRegenerate,
  onDeleteTeam,
}: {
  session: SessionData
  isOrganizer: boolean
  canRegenerate: boolean
  onDeleteTeam?: (teamId: string) => void
}) {
  const [pending, startTransition] = useTransition()

  // Teams that have no started/completed matches can be deleted
  const startedTeamIds = new Set(
    session.matches
      .filter((m) => m.status !== "PENDING")
      .flatMap((m) => [m.homeTeamId, m.awayTeamId])
  )

  function handleRegenerate(mode: "RANDOM" | "BALANCED") {
    startTransition(async () => {
      try {
        const numTeams = session.teams.length as 2 | 3
        await generateTeams(session.id, numTeams, mode)
        toast.success(`Teams regenerated (${mode === "BALANCED" ? "balanced" : "random"}).`)
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {session.teams.map((team) => (
          <Card key={team.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{team.name}</CardTitle>
                {isOrganizer && onDeleteTeam && !startedTeamIds.has(team.id) && (
                  <button
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => onDeleteTeam(team.id)}
                    title="Delete team"
                  >
                    ✕ Delete
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {team.players.map((p) => (
                  <li key={p.id} className="text-sm flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {playerInitials(p.displayName)}
                    </span>
                    <span className="flex-1">{p.displayName}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {p.seasonRank != null ? `#${p.seasonRank} · ` : ""}{p.seasonPoints} pts
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 pt-2 border-t border-border/40 space-y-0.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Total</span>
                  <span className="font-semibold tabular-nums">
                    {team.players.reduce((s, p) => s + p.seasonPoints, 0)} pts
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Avg</span>
                  <span className="tabular-nums">
                    {team.players.length > 0
                      ? (team.players.reduce((s, p) => s + p.seasonPoints, 0) / team.players.length).toFixed(1)
                      : "—"} pts
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {isOrganizer && canRegenerate && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => handleRegenerate("RANDOM")}>
            Shuffle randomly
          </Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => handleRegenerate("BALANCED")}>
            Balance by rating
          </Button>
        </div>
      )}
    </div>
  )
}

function GoalDialog({
  matchId,
  sessionId,
  teamId,
  teamName,
  players,
}: {
  matchId: string
  sessionId: string
  teamId: string
  teamName: string
  players: Player[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [scorerId, setScorerId] = useState("")
  const [assisterId, setAssisterId] = useState("")
  const [pending, startTransition] = useTransition()

  function handleRecord() {
    if (!scorerId) { toast.error("Select the scorer."); return }
    startTransition(async () => {
      try {
        await recordGoal(matchId, scorerId, teamId, assisterId || undefined)
        toast.success("Goal recorded.")
        setOpen(false)
        setScorerId("")
        setAssisterId("")
        router.refresh()
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  const assistCandidates = players.filter((p) => p.id !== scorerId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        +1 {teamName}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Goal — {teamName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Scorer</Label>
            <Select value={scorerId} onValueChange={(v) => { if (v !== null) setScorerId(v) }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select scorer…">
                  {(v: string) => players.find((p) => p.id === v)?.name ?? "Select scorer…"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {players.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Assist (optional)</Label>
            <Select value={assisterId} onValueChange={(v) => setAssisterId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No assist">
                  {(v: string) => v ? (assistCandidates.find((p) => p.id === v)?.name ?? "No assist") : "No assist"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No assist</SelectItem>
                {assistCandidates.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleRecord} disabled={pending || !scorerId}>
            {pending ? "Saving…" : "Record Goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ActiveMatch({
  match,
  session,
  isOrganizer,
}: {
  match: Match
  session: SessionData
  isOrganizer: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const homeTeam = session.teams.find((t) => t.id === match.homeTeamId)!
  const awayTeam = session.teams.find((t) => t.id === match.awayTeamId)!

  function handleDeleteGoal(goalId: string) {
    startTransition(async () => {
      try { await deleteGoal(goalId); router.refresh() }
      catch (e) { toast.error((e as Error).message) }
    })
  }

  // Disambiguated display names across both teams (uses displayName, not full name)
  const allPlayers = [...homeTeam.players, ...awayTeam.players]
  const shortName = disambiguateNames(allPlayers.map((p) => ({ id: p.id, name: p.displayName, fullName: p.name })))

  function handleUndo() {
    startTransition(async () => {
      try {
        await undoLastGoal(match.id)
        router.refresh()
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleEndTime() {
    startTransition(async () => {
      try {
        await endMatch(match.id, "TIME")
        toast.success("Match ended.")
        router.refresh()
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  const atLimit = match.homeScore >= 10 || match.awayScore >= 10

  return (
    <Card className="border-primary/40 shadow-sm">
      <CardHeader className="bg-primary/5 rounded-t-xl">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
          {match.roundNumber != null ? `Round ${match.roundNumber} · ` : ""}
          {match.homeTeamName} vs {match.awayTeamName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-center gap-8 py-4">
          <div className="flex flex-col items-center">
            <div className="text-4xl font-bold text-center">{match.homeScore}</div>
            <div className="text-sm text-muted-foreground mt-1 text-center">{match.homeTeamName}</div>
            <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
              {homeTeam.players.map((p) => (
                <div key={p.id}>
                  {p.seasonRank != null ? <span className="opacity-60">#{p.seasonRank} </span> : null}
                  {shortName.get(p.id) ?? p.displayName}
                  <span className="opacity-60"> · {p.seasonPoints} pts</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-2xl font-light text-muted-foreground">–</div>
          <div className="flex flex-col items-center">
            <div className="text-4xl font-bold text-center">{match.awayScore}</div>
            <div className="text-sm text-muted-foreground mt-1 text-center">{match.awayTeamName}</div>
            <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
              {awayTeam.players.map((p) => (
                <div key={p.id}>
                  {p.seasonRank != null ? <span className="opacity-60">#{p.seasonRank} </span> : null}
                  {shortName.get(p.id) ?? p.displayName}
                  <span className="opacity-60"> · {p.seasonPoints} pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {atLimit && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
            10 goals reached — end the match?
          </div>
        )}

        {/* Goal recording buttons */}
        <div className="flex flex-wrap gap-2">
          <GoalDialog
            matchId={match.id}
            sessionId={session.id}
            teamId={match.homeTeamId}
            teamName={match.homeTeamName}
            players={homeTeam.players}
          />
          <GoalDialog
            matchId={match.id}
            sessionId={session.id}
            teamId={match.awayTeamId}
            teamName={match.awayTeamName}
            players={awayTeam.players}
          />
          {match.goals.length > 0 && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={handleUndo}>
              Undo last goal
            </Button>
          )}
        </div>

        {/* Goals timeline */}
        {match.goals.length > 0 && (
          <div className="space-y-1 pt-2">
            {match.goals.reduce<{ home: number; away: number; els: React.ReactNode[] }>(
              (acc, g) => {
                const isHome = g.teamId === match.homeTeamId
                const home = acc.home + (isHome ? 1 : 0)
                const away = acc.away + (isHome ? 0 : 1)
                acc.els.push(
                  <div key={g.id} className="text-sm flex items-center gap-2">
                    <span className="text-muted-foreground w-16 shrink-0">
                      {format(new Date(g.scoredAt), "HH:mm")}
                    </span>
                    <span className="font-medium tabular-nums w-10 shrink-0">{home}:{away}</span>
                    <span className="font-medium">{g.scoredByName}</span>
                    {g.assistedByName && <span className="text-muted-foreground">(assist: {g.assistedByName})</span>}
                    <Badge variant="outline" className="ml-auto">{isHome ? match.homeTeamName : match.awayTeamName}</Badge>
                    {isOrganizer && (
                      <button
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        disabled={pending}
                        onClick={() => handleDeleteGoal(g.id)}
                        title="Remove this goal"
                      >×</button>
                    )}
                  </div>
                )
                return { home, away, els: acc.els }
              },
              { home: 0, away: 0, els: [] }
            ).els}
          </div>
        )}

        {isOrganizer && (
          <div className="flex gap-2 pt-2 border-t">
            {atLimit && (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    try { await endMatch(match.id, "GOALS"); toast.success("Match ended."); router.refresh() }
                    catch (e) { toast.error((e as Error).message) }
                  })
                }}
              >
                End Match (10 goals)
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={pending} onClick={handleEndTime}>
              End Match (time)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StandingsTable({ teams, matches }: { teams: Team[]; matches: Match[] }) {
  const standings = computeStandings(teams, matches)
  return (
    <SportsTable title="Standings">
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Team</TableHead>
          <TableHead className="text-right">Played</TableHead>
          <TableHead className="text-right">Pts</TableHead>
          <TableHead className="text-right">GF</TableHead>
          <TableHead className="text-right">GA</TableHead>
          <TableHead className="text-right">GD</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {standings.map((s, i) => (
          <TableRow key={s.name}>
            <TableCell className="font-medium">
              <span className="text-muted-foreground mr-2">{i + 1}.</span>{s.name}
            </TableCell>
            <TableCell className="text-right">{s.played}</TableCell>
            <TableCell className="text-right font-semibold">{s.pts}</TableCell>
            <TableCell className="text-right">{s.gf}</TableCell>
            <TableCell className="text-right">{s.ga}</TableCell>
            <TableCell className="text-right">{s.gf - s.ga > 0 ? "+" : ""}{s.gf - s.ga}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </SportsTable>
  )
}

function MatchSummary({ match, onReopen, onDeleteGoal }: { match: Match; onReopen?: () => void; onDeleteGoal?: (id: string) => void }) {
  const goals = match.goals.reduce<{ home: number; away: number; els: React.ReactNode[] }>(
    (acc, g) => {
      const isHome = g.teamId === match.homeTeamId
      const home = acc.home + (isHome ? 1 : 0)
      const away = acc.away + (isHome ? 0 : 1)
      acc.els.push(
        <div key={g.id} className={`text-xs flex items-center gap-1.5 ${isHome ? "flex-row" : "flex-row-reverse"}`}>
          <span className="font-semibold tabular-nums text-foreground">{home}:{away}</span>
          <span className="text-muted-foreground">⚽</span>
          <span className="font-medium">{g.scoredByName}</span>
          {g.assistedByName && <span className="text-muted-foreground opacity-70">↪ {g.assistedByName}</span>}
          {onDeleteGoal && (
            <button
              className="text-muted-foreground hover:text-destructive transition-colors ml-1"
              onClick={() => onDeleteGoal(g.id)}
              title="Remove this goal"
            >×</button>
          )}
        </div>
      )
      return { home, away, els: acc.els }
    },
    { home: 0, away: 0, els: [] }
  )

  return (
    <div className="overflow-hidden rounded-xl border border-border shadow-sm bg-card">
      {/* Score bar */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-4"
        style={{ background: "linear-gradient(135deg, oklch(0.20 0.07 150) 0%, oklch(0.32 0.11 150) 100%)" }}
      >
        <div className="text-right">
          <div className="text-white font-bold text-sm truncate">{match.homeTeamName}</div>
        </div>
        <div className="flex items-center gap-3 px-3">
          <span className="text-3xl font-extrabold tabular-nums text-white leading-none">{match.homeScore}</span>
          <span className="text-white/40 font-light text-xl">:</span>
          <span className="text-3xl font-extrabold tabular-nums text-white leading-none">{match.awayScore}</span>
        </div>
        <div className="text-left">
          <div className="text-white font-bold text-sm truncate">{match.awayTeamName}</div>
        </div>
      </div>

      {/* Goal log split by team */}
      {match.goals.length > 0 && (
        <div className="grid grid-cols-2 divide-x divide-border/50 text-xs px-4 py-2.5 gap-x-4">
          <div className="space-y-0.5 pr-2">
            {goals.els.filter((_, i) => match.goals[i]?.teamId === match.homeTeamId)}
          </div>
          <div className="space-y-0.5 pl-2">
            {goals.els.filter((_, i) => match.goals[i]?.teamId === match.awayTeamId)}
          </div>
        </div>
      )}

      {/* Reopen */}
      {onReopen && (
        <div className="px-4 pb-2 border-t border-border/40 pt-2">
          <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={onReopen}>
            Re-open match
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── End session dialog (for mixed tournament+normal sessions) ────────────────

function EndSessionDialog({ onConfirm, disabled }: { onConfirm: (scope: PointsScope) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const opts: { scope: PointsScope; label: string; desc: string }[] = [
    { scope: "all",        label: "All matches",        desc: "Count points from both tournament placement and normal match results." },
    { scope: "tournament", label: "Tournament only",    desc: "Count points only from tournament placement. Normal matches ignored for points." },
    { scope: "normal",     label: "Normal matches only",desc: "Count points only from normal match results (win=3, draw=1). Tournament ignored." },
    { scope: "none",       label: "Goals & assists only",desc: "No points awarded. Only goals and assists are recorded." },
  ]
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={disabled} />}>
        End Game Day
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>End Game Day — choose scoring</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This game day had both tournament rounds and normal matches. Which results should count for points?
        </p>
        <div className="space-y-2">
          {opts.map(({ scope, label, desc }) => (
            <button
              key={scope}
              onClick={() => { onConfirm(scope); setOpen(false) }}
              className="w-full text-left rounded-lg border border-border p-3 hover:border-primary/60 hover:bg-primary/5 transition-colors"
            >
              <div className="font-semibold text-sm">{label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Switch to normal play dialog ─────────────────────────────────────────────

function SwitchToNormalDialog({ onConfirm, disabled }: { onConfirm: (mode: "RANDOM" | "BALANCED") => void; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={disabled} />}>
        Switch to normal play
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Switch to normal play</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Stop the tournament and form new 2-team matches. How should the teams be formed?
        </p>
        <DialogFooter className="flex-col gap-2">
          <Button onClick={() => { onConfirm("RANDOM"); setOpen(false) }}>
            Random teams
          </Button>
          <Button variant="outline" onClick={() => { onConfirm("BALANCED"); setOpen(false) }}>
            Balanced teams (by rating)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, live, collapsible }: { title: string; live?: boolean; collapsible?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {live && <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {collapsible && <span className="ml-auto text-xs text-muted-foreground group-open:hidden">▼ show</span>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SessionClient({
  session,
  currentUserId,
  isOrganizer,
}: {
  session: SessionData
  currentUserId: string
  isOrganizer: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const activeMatch = session.matches.find((m) => m.status === "IN_PROGRESS")
  const pendingMatches = session.matches.filter((m) => m.status === "PENDING")
  const completedMatches = session.matches.filter((m) => m.status === "COMPLETED")

  // Whether this session started as a tournament (any match has a round number)
  const startedAsTournament = session.matches.some((m) => m.roundNumber != null)
  // Whether we're currently in tournament mode
  // Switches to false as soon as a normal (roundNumber=null) pending or active match exists
  const hasNormalMatch = session.matches.some((m) => m.roundNumber == null)
  const isCurrentlyTournament = startedAsTournament && !hasNormalMatch

  // For tournament: current round is the highest round number among all matches
  const currentRound = startedAsTournament
    ? Math.max(...session.matches.filter((m) => m.roundNumber != null).map((m) => m.roundNumber!), 0)
    : null
  const roundMatches = currentRound != null
    ? session.matches.filter((m) => m.roundNumber === currentRound)
    : []
  const roundComplete = roundMatches.length > 0 && roundMatches.every((m) => m.status === "COMPLETED")

  function handleStartMatch(matchId: string) {
    startTransition(async () => {
      try { await startMatch(matchId); router.refresh() }
      catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleNextRound() {
    startTransition(async () => {
      try { await startNextRound(session.id); toast.success("Round started."); router.refresh() }
      catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleEndSession(pointsScope: PointsScope = "all") {
    startTransition(async () => {
      try { await endSession(session.id, pointsScope); toast.success("Game day completed."); router.refresh() }
      catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleReopenMatch(matchId: string) {
    startTransition(async () => {
      try { await reopenMatch(matchId); toast.success("Match re-opened."); router.refresh() }
      catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleDeleteGoal(goalId: string) {
    startTransition(async () => {
      try { await deleteGoal(goalId); router.refresh() }
      catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleReopenSession() {
    startTransition(async () => {
      try { await reopenSession(session.id); toast.success("Game day re-opened."); router.refresh() }
      catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleRematch() {
    startTransition(async () => {
      try { await addRematch(session.id); toast.success("Rematch created."); router.refresh() }
      catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleNewMatch(mode: "RANDOM" | "BALANCED") {
    startTransition(async () => {
      try { await addNewMatch(session.id, mode); toast.success("New match created."); router.refresh() }
      catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleDeleteTeam(teamId: string) {
    startTransition(async () => {
      try { await deleteTeam(teamId); toast.success("Team deleted."); router.refresh() }
      catch (e) { toast.error((e as Error).message) }
    })
  }

  const statusLabel: Record<string, string> = {
    SCHEDULED: "Scheduled",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  }

  return (
    <div className="space-y-6 -mt-6">

      {/* ── Header banner ──────────────────────────────────────────── */}
      <div className="relative overflow-hidden -mx-4 px-6 py-6 text-white"
        style={{ background: "linear-gradient(135deg, oklch(0.18 0.07 150) 0%, oklch(0.34 0.12 150) 100%)" }}
      >
        {/* subtle pitch texture */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden
          style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 39px, white 39px, white 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, white 39px, white 40px)" }}
        />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide
              ${session.status === "IN_PROGRESS" ? "bg-green-400/20 text-green-300 border border-green-400/40" :
                session.status === "COMPLETED" ? "bg-white/15 text-white/80 border border-white/20" :
                "bg-white/10 text-white/60 border border-white/15"}`}
            >
              {session.status === "IN_PROGRESS" && <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />}
              {session.status === "IN_PROGRESS" ? "Live" :
               session.status === "COMPLETED" ? (startedAsTournament ? "🏆 Tournament complete" : "✓ Completed") :
               session.status === "CANCELLED" ? "✕ Cancelled" : "Scheduled"}
            </span>
            {startedAsTournament && session.status !== "SCHEDULED" && (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-white/10 text-white/70 border border-white/15">
                🏆 Tournament · {session.teams.length} teams
              </span>
            )}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {format(new Date(session.date), "EEEE, d MMMM yyyy")}
          </h1>
          <p className="text-white/60 text-sm mt-0.5">
            {format(new Date(session.date), "HH:mm")} · Season {session.seasonYear}
            {completedMatches.length > 0 && ` · ${completedMatches.length} match${completedMatches.length > 1 ? "es" : ""} played`}
          </p>
        </div>
      </div>

      {/* CANCELLED */}
      {session.status === "CANCELLED" && (
        <p className="text-muted-foreground">This game day was cancelled.</p>
      )}

      {/* SCHEDULED — no teams yet */}
      {session.status === "SCHEDULED" && session.teams.length === 0 && (
        <div className="space-y-4">
          <RegistrationPanel session={session} isOrganizer={isOrganizer} />
          {isOrganizer && <FormTeamsDialog session={session} />}
        </div>
      )}

      {/* SCHEDULED — teams exist */}
      {session.status === "SCHEDULED" && session.teams.length > 0 && (
        <div className="space-y-4">
          <RegistrationPanel session={session} isOrganizer={isOrganizer} />
          <SectionHeader title="Teams" />
          <TeamsView session={session} isOrganizer={isOrganizer} canRegenerate={true} onDeleteTeam={isOrganizer ? handleDeleteTeam : undefined} />
          {isOrganizer && (
            <div className="flex gap-2">
              <FormTeamsDialog session={session} />
              {pendingMatches.length > 0 && (
                <Button size="sm" disabled={pending} onClick={() => handleStartMatch(pendingMatches[0].id)}>
                  {startedAsTournament && completedMatches.length === 0 ? "Start Round 1" : "Start Match"}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* IN_PROGRESS */}
      {session.status === "IN_PROGRESS" && (
        <div className="space-y-6">

          {/* Active live match */}
          {activeMatch && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <SectionHeader title="Live Match" live />
                <a href={`/sessions/${session.id}/scoreboard`} target="empor-scoreboard" rel="noopener noreferrer"
                  className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                >
                  Open scoreboard ↗
                </a>
              </div>
              <ActiveMatch match={activeMatch} session={session} isOrganizer={isOrganizer} />
            </div>
          )}

          {/* Next pending match */}
          {!activeMatch && pendingMatches.length > 0 && (isCurrentlyTournament ? !roundComplete : true) && (
            <div>
              <SectionHeader title="Next Match" />
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{pendingMatches[0].homeTeamName} vs {pendingMatches[0].awayTeamName}</span>
                    {isOrganizer && (
                      <Button size="sm" disabled={pending} onClick={() => handleStartMatch(pendingMatches[0].id)}>
                        Start Match
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Teams (collapsed) */}
          <details className="group">
            <summary className="cursor-pointer list-none">
              <SectionHeader title={`Teams (${session.teams.length})`} collapsible />
            </summary>
            <div className="mt-3">
              <TeamsView session={session} isOrganizer={isOrganizer} canRegenerate={false} onDeleteTeam={isOrganizer ? handleDeleteTeam : undefined} />
            </div>
          </details>

          {/* Completed matches */}
          {completedMatches.length > 0 && (
            <div className="space-y-3">
              {isCurrentlyTournament ? (
                <>
                  <SectionHeader title={`Round ${currentRound} Results`} />
                  <div className="space-y-3">
                    {completedMatches
                      .filter((m) => m.roundNumber === currentRound)
                      .map((m) => <MatchSummary key={m.id} match={m} onReopen={isOrganizer ? () => handleReopenMatch(m.id) : undefined} onDeleteGoal={isOrganizer ? handleDeleteGoal : undefined} />)}
                  </div>
                  {/* Previous rounds collapsed */}
                  {(currentRound ?? 0) > 1 && (
                    <details>
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground py-1">
                        Show previous rounds
                      </summary>
                      <div className="mt-2 space-y-4">
                        {Array.from({ length: (currentRound ?? 1) - 1 }, (_, i) => i + 1).map((r) => (
                          <div key={r} className="space-y-2">
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Round {r}</div>
                            {completedMatches.filter((m) => m.roundNumber === r).map((m) => (
                              <MatchSummary key={m.id} match={m} onReopen={isOrganizer ? () => handleReopenMatch(m.id) : undefined} onDeleteGoal={isOrganizer ? handleDeleteGoal : undefined} />
                            ))}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              ) : (
                <>
                  <SectionHeader title="Match Results" />
                  <div className="space-y-3">
                    {completedMatches.map((m) => <MatchSummary key={m.id} match={m} onReopen={isOrganizer ? () => handleReopenMatch(m.id) : undefined} onDeleteGoal={isOrganizer ? handleDeleteGoal : undefined} />)}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tournament standings */}
          {startedAsTournament && completedMatches.filter((m) => m.roundNumber != null).length > 0 && (
            <StandingsTable
              teams={session.teams.filter((t) => session.matches.some((m) => m.roundNumber != null && (m.homeTeamId === t.id || m.awayTeamId === t.id)))}
              matches={session.matches.filter((m) => m.roundNumber != null)}
            />
          )}

          {/* Tournament controls */}
          {isCurrentlyTournament && !activeMatch && isOrganizer && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {roundComplete && (currentRound ?? 0) < 5 && (
                <Button disabled={pending} onClick={handleNextRound}>
                  ▶ Play Round {(currentRound ?? 0) + 1}
                </Button>
              )}
              <SwitchToNormalDialog onConfirm={(mode) => handleNewMatch(mode)} disabled={pending} />
              {roundComplete && (
                <Button variant="outline" disabled={pending} onClick={() => handleEndSession("tournament")}>
                  End Game Day
                </Button>
              )}
            </div>
          )}

          {/* Normal play controls (2-team or after switching from tournament) */}
          {!isCurrentlyTournament && !activeMatch && completedMatches.length > 0 && isOrganizer && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {startedAsTournament && (
                <div className="w-full text-xs text-muted-foreground mb-1 italic">
                  Tournament paused — continuing with normal play
                </div>
              )}
              <Button size="sm" disabled={pending} onClick={handleRematch}>
                Rematch (same teams)
              </Button>
              <NewMatchDialog session={session} disabled={pending} />
              {startedAsTournament ? (
                <EndSessionDialog onConfirm={handleEndSession} disabled={pending} />
              ) : (
                <Button variant="outline" size="sm" disabled={pending} onClick={() => handleEndSession("all")}>
                  End Game Day
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* COMPLETED */}
      {session.status === "COMPLETED" && (
        <div className="space-y-6">

          {startedAsTournament ? (
            /* ── Tournament results: grouped by round, then any normal matches ── */
            <>
              {Array.from(new Set(session.matches.filter(m => m.roundNumber != null).map((m) => m.roundNumber))).sort((a, b) => (a ?? 0) - (b ?? 0)).map((round) => {
                const roundMatches = session.matches.filter((m) => m.roundNumber === round && m.status === "COMPLETED")
                if (roundMatches.length === 0) return null
                return (
                  <div key={round} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white"
                        style={{ background: "oklch(0.46 0.16 150)" }}
                      >Round {round}</span>
                    </div>
                    {roundMatches.map((m) => (
                      <MatchSummary key={m.id} match={m} onReopen={isOrganizer ? () => handleReopenMatch(m.id) : undefined} onDeleteGoal={isOrganizer ? handleDeleteGoal : undefined} />
                    ))}
                  </div>
                )
              })}
              <StandingsTable
                teams={session.teams.filter((t) => session.matches.some((m) => m.roundNumber != null && (m.homeTeamId === t.id || m.awayTeamId === t.id)))}
                matches={session.matches.filter((m) => m.roundNumber != null)}
              />
              {/* Normal matches played after tournament was stopped */}
              {session.matches.filter((m) => m.roundNumber == null && m.status === "COMPLETED").length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold bg-muted text-muted-foreground border">
                      Normal play (after tournament)
                    </span>
                  </div>
                  {session.matches.filter((m) => m.roundNumber == null && m.status === "COMPLETED").map((m) => (
                    <MatchSummary key={m.id} match={m} onReopen={isOrganizer ? () => handleReopenMatch(m.id) : undefined} onDeleteGoal={isOrganizer ? handleDeleteGoal : undefined} />
                  ))}
                </div>
              )}
            </>
          ) : (
            /* ── Regular results ── */
            <div className="space-y-3">
              <SectionHeader title="Results" />
              {session.matches.filter((m) => m.status === "COMPLETED").map((m) => (
                <MatchSummary key={m.id} match={m} onReopen={isOrganizer ? () => handleReopenMatch(m.id) : undefined} onDeleteGoal={isOrganizer ? handleDeleteGoal : undefined} />
              ))}
            </div>
          )}

          <details className="group">
            <summary className="cursor-pointer list-none">
              <SectionHeader title="Teams" collapsible />
            </summary>
            <div className="mt-3">
              <TeamsView session={session} isOrganizer={isOrganizer} canRegenerate={false} onDeleteTeam={isOrganizer ? handleDeleteTeam : undefined} />
            </div>
          </details>

          {isOrganizer && (
            <Button variant="outline" size="sm" disabled={pending} onClick={handleReopenSession}>
              Re-open Game Day
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
