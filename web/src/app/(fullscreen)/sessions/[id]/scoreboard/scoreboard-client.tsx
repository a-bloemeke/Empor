"use client"

import { useState, useTransition, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Drawer } from "@base-ui/react/drawer"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { recordGoal, deleteGoal, updateGoal } from "@/app/(app)/sessions/[id]/actions"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { disambiguateNames } from "@/lib/game-logic"

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = { id: string; name: string; displayName: string; seasonPoints: number; seasonRank: number | null }
type Team = { id: string; name: string; players: Player[] }
type GoalEntry = {
  id: string
  scoredByName: string
  assistedByName: string | null
  teamId: string
  scoredAt: string
}
type ActiveMatch = {
  id: string
  homeTeamId: string
  homeTeamName: string
  awayTeamId: string
  awayTeamName: string
  homeScore: number
  awayScore: number
  roundNumber: number | null
  goals: GoalEntry[]
}

type Props = {
  sessionId: string
  currentUserId: string
  activeMatch: ActiveMatch | null
  teams: Team[]
}

// ─── Audio & Speech ───────────────────────────────────────────────────────────

function playSound(path: string, volume = 1.0) {
  try {
    const audio = new Audio(path)
    audio.volume = volume
    audio.play().catch(() => {/* autoplay blocked — user hasn't interacted yet */})
  } catch {
    // Audio not available
  }
}

function playTruckHorn() {
  playSound("/sounds/truck-horn.mp3")
}

function speakLastMinute() {
  playSound("/sounds/last-minute.mp3")
}

function playLastTenSeconds() {
  try {
    const audio = new Audio("/sounds/last-10-seconds.mp3")
    audio.addEventListener("loadedmetadata", () => {
      // Stretch or compress to fit exactly 10 seconds
      if (audio.duration > 0) audio.playbackRate = audio.duration / 10
      audio.play().catch(() => {})
    })
    // Fallback: if metadata already loaded
    if (audio.readyState >= 1 && audio.duration > 0) {
      audio.playbackRate = audio.duration / 10
      audio.play().catch(() => {})
    }
  } catch {
    // Audio not available
  }
}

// ─── Timer ────────────────────────────────────────────────────────────────────

const DURATION_OPTIONS = [
  { label: "1 min", value: 1 },
  { label: "2 min", value: 2 },
  { label: "5 min", value: 5 },
  { label: "6 min", value: 6 },
  { label: "7 min", value: 7 },
  { label: "8 min", value: 8 },
  { label: "9 min", value: 9 },
  { label: "10 min", value: 10 },
]

type TimerState = "idle" | "running" | "paused" | "expired"

function useMatchTimer(matchId: string) {
  const [durationMin, setDurationMin] = useState(7)
  const [state, setState] = useState<TimerState>("idle")
  const [remaining, setRemaining] = useState(7 * 60)
  const [isBlinking, setIsBlinking] = useState(false)
  const [isGreen, setIsGreen] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastMinuteSpokenRef = useRef(false)
  const lastTenPlayedRef = useRef(false)

  // Reset when match changes
  useEffect(() => {
    setState("idle")
    setRemaining(durationMin * 60)
    setIsBlinking(false)
    setIsGreen(false)
    lastMinuteSpokenRef.current = false
    lastTenPlayedRef.current = false
    if (intervalRef.current) clearInterval(intervalRef.current)
  }, [matchId]) // eslint-disable-line react-hooks/exhaustive-deps

  function start() {
    if (state !== "idle" && state !== "paused") return
    setState("running")
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        const next = r - 1
        if (next === 60 && !lastMinuteSpokenRef.current && durationMin > 1) {
          lastMinuteSpokenRef.current = true
          speakLastMinute()
        }
        if (next === 10 && !lastTenPlayedRef.current) {
          lastTenPlayedRef.current = true
          playLastTenSeconds()
        }
        if (next <= 0) {
          clearInterval(intervalRef.current!)
          setState("expired")
          setIsBlinking(true)
          playTruckHorn()
          // After 5s: stop blinking, turn green
          setTimeout(() => {
            setIsBlinking(false)
            setIsGreen(true)
          }, 5000)
          return 0
        }
        return next
      })
    }, 1000)
  }

  function pause() {
    if (state !== "running") return
    if (intervalRef.current) clearInterval(intervalRef.current)
    setState("paused")
  }

  function reset() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setState("idle")
    setRemaining(durationMin * 60)
    setIsBlinking(false)
    setIsGreen(false)
    lastMinuteSpokenRef.current = false
    lastTenPlayedRef.current = false
  }

  function changeDuration(min: number) {
    if (state !== "idle") return
    setDurationMin(min)
    setRemaining(min * 60)
    lastMinuteSpokenRef.current = false
  }

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0")
  const ss = String(remaining % 60).padStart(2, "0")
  // Last minute: remaining 60→0, interpolate hue 60 (yellow) → 0 (red)
  const isLastMinute = state === "running" && remaining <= 60 && remaining > 0 && durationMin > 1
  // Progress through last minute: 0 (just started) → 1 (0 seconds left)
  const lastMinuteProgress = isLastMinute ? (60 - remaining) / 59 : 0

  return { state, remaining, display: `${mm}:${ss}`, durationMin, isBlinking, isGreen, isLastMinute, lastMinuteProgress, start, pause, reset, changeDuration }
}

// ─── Goal Drawer ──────────────────────────────────────────────────────────────

function GoalDrawer({
  open,
  onOpenChange,
  matchId,
  sessionId,
  teamId,
  teamName,
  players,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  matchId: string
  sessionId: string
  teamId: string
  teamName: string
  players: Player[]
}) {
  const router = useRouter()
  const [scorerId, setScorerId] = useState("")
  const [assisterId, setAssisterId] = useState("")
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) { setScorerId(""); setAssisterId("") }
  }, [open])

  function handleRecord() {
    if (!scorerId) { toast.error("Select the scorer."); return }
    startTransition(async () => {
      try {
        await recordGoal(matchId, scorerId, teamId, assisterId || undefined)
        toast.success("Goal recorded.")
        onOpenChange(false)
        router.refresh()
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  const assistCandidates = players.filter((p) => p.id !== scorerId)

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} swipeDirection="down">
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Popup className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-background p-6 pb-safe shadow-xl outline-none">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted" />
          <h2 className="mb-6 text-lg font-semibold">Goal — {teamName}</h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Scorer</Label>
              <Select value={scorerId} onValueChange={(v) => { if (v) setScorerId(v) }}>
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
          <div className="mt-6 flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button className="flex-1" onClick={handleRecord} disabled={pending || !scorerId}>
              {pending ? "Saving…" : "Record Goal"}
            </Button>
          </div>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

// ─── Edit Goal Drawer ─────────────────────────────────────────────────────────

function EditGoalDrawer({
  open,
  onOpenChange,
  goal,
  matchId,
  allPlayers,  // all players from both teams
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal: GoalEntry
  matchId: string
  allPlayers: Player[]
}) {
  const router = useRouter()
  const [scorerId, setScorerId] = useState(goal.id ? "" : "")
  const [assisterId, setAssisterId] = useState("")
  const [pending, startTransition] = useTransition()

  // Pre-fill on open
  useEffect(() => {
    if (open) {
      // Find scorer by name match — we have name but not id in GoalEntry
      const scorer = allPlayers.find((p) => p.name === goal.scoredByName || p.displayName === goal.scoredByName)
      const assister = goal.assistedByName
        ? allPlayers.find((p) => p.name === goal.assistedByName || p.displayName === goal.assistedByName)
        : null
      setScorerId(scorer?.id ?? "")
      setAssisterId(assister?.id ?? "")
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSave() {
    if (!scorerId) { toast.error("Select the scorer."); return }
    startTransition(async () => {
      try {
        await updateGoal(goal.id, scorerId, assisterId || undefined)
        toast.success("Goal updated.")
        onOpenChange(false)
        router.refresh()
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteGoal(goal.id)
        toast.success("Goal removed.")
        onOpenChange(false)
        router.refresh()
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  const assistCandidates = allPlayers.filter((p) => p.id !== scorerId)

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} swipeDirection="down">
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Popup className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-background p-6 pb-safe shadow-xl outline-none">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted" />
          <h2 className="mb-4 text-lg font-semibold">Edit Goal</h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Scorer</Label>
              <Select value={scorerId} onValueChange={(v) => { if (v) setScorerId(v) }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select scorer…">
                    {(v: string) => allPlayers.find((p) => p.id === v)?.displayName ?? "Select scorer…"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {allPlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assist (optional)</Label>
              <Select value={assisterId} onValueChange={(v) => setAssisterId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No assist">
                    {(v: string) => v ? (assistCandidates.find((p) => p.id === v)?.displayName ?? "No assist") : "No assist"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No assist</SelectItem>
                  {assistCandidates.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={pending}>
              Remove
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={pending || !scorerId}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

// ─── Scoreboard ───────────────────────────────────────────────────────────────

export function ScoreboardClient({ sessionId, currentUserId, activeMatch, teams }: Props) {
  const router = useRouter()
  const [drawerSide, setDrawerSide] = useState<"home" | "away" | null>(null)
  const [editGoal, setEditGoal] = useState<GoalEntry | null>(null)
  const timer = useMatchTimer(activeMatch?.id ?? "")

  const refresh = useCallback(() => router.refresh(), [router])

  // Auto-refresh every 5 s — pause while drawer is open to avoid losing it
  useEffect(() => {
    if (drawerSide) return
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh, drawerSide])

  if (!activeMatch) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-lg">No active match right now.</p>
      </div>
    )
  }

  const homeTeam = teams.find((t) => t.id === activeMatch.homeTeamId)!
  const awayTeam = teams.find((t) => t.id === activeMatch.awayTeamId)!
  const drawerTeam = drawerSide === "home" ? homeTeam : drawerSide === "away" ? awayTeam : null
  const drawerTeamId = drawerSide === "home" ? activeMatch.homeTeamId : activeMatch.awayTeamId

  const shortName = disambiguateNames([...homeTeam.players, ...awayTeam.players].map((p) => ({ id: p.id, name: p.displayName, fullName: p.name })))

  const isExpired = timer.state === "expired"
  const isRunning = timer.state === "running"
  const isPaused = timer.state === "paused"
  // White text when board is red or green
  const inv = isExpired || timer.isGreen

  // Compute board background:
  // - Last minute: interpolate yellow (hsl 60) → red (hsl 0) each second, with odd/even blink
  // - Expired blinking: red pulsing for 5s
  // - Expired done: green
  // - Otherwise: default background
  let boardStyle: React.CSSProperties = {}
  let boardClass = "bg-background"

  if (timer.isGreen) {
    boardStyle = { backgroundColor: "#006400" }
    boardClass = "transition-colors duration-1000"
  } else if (isExpired && timer.isBlinking) {
    boardClass = "bg-red-600 animate-pulse"
  } else if (isExpired) {
    boardClass = "bg-red-600"
  } else if (timer.isLastMinute) {
    // hue: 60 (yellow) at start → 0 (red) at end
    const hue = Math.round(60 * (1 - timer.lastMinuteProgress))
    // Blink: alternate between full saturation and 80% lightness each second
    const blink = timer.remaining % 2 === 0
    boardStyle = { backgroundColor: `hsl(${hue}, 100%, ${blink ? "45%" : "55%"})` }
    boardClass = "transition-colors duration-500"
  }

  return (
    <div className={cn("flex min-h-screen flex-col select-none", boardClass)} style={boardStyle}>

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <span className={cn("text-sm", inv ? "text-white/80" : "text-muted-foreground")}>
          {activeMatch.roundNumber != null ? `Round ${activeMatch.roundNumber} · ` : ""}
          {activeMatch.homeTeamName} vs {activeMatch.awayTeamName}
        </span>
        <a
          href={`/sessions/${sessionId}`}
          className={cn("text-sm underline-offset-4 hover:underline", inv ? "text-white/80" : "text-muted-foreground")}
        >
          ← Session
        </a>
      </div>

      {/* Timer bar — only for tournament matches (roundNumber != null) */}
      {activeMatch.roundNumber != null && (
      <div className="flex items-center justify-center gap-4 px-6 py-3 border-b border-border/30">
        {/* Duration selector — only when idle */}
        {timer.state === "idle" && (
          <Select
            value={String(timer.durationMin)}
            onValueChange={(v) => { if (v) timer.changeDuration(Number(v)) }}
          >
            <SelectTrigger className="w-24 h-8 text-sm">
              <SelectValue>
                {(v: string) => `${v} min`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Timer display */}
        <span className={cn(
          "font-mono font-bold tabular-nums text-3xl tracking-wider",
          isExpired ? "text-white" : timer.isLastMinute ? "text-yellow-900" : isRunning ? "text-foreground" : isPaused ? "text-yellow-500" : "text-muted-foreground"
        )}>
          {timer.display}
        </span>

        {/* Controls */}
        {timer.state === "idle" && (
          <Button size="sm" onClick={timer.start} className="gap-1.5">
            ▶ Start
          </Button>
        )}
        {isRunning && (
          <Button size="sm" variant="ghost" onClick={timer.pause}>
            ⏸ Pause
          </Button>
        )}
        {isPaused && (
          <Button size="sm" onClick={timer.start} className="gap-1.5">
            ▶ Resume
          </Button>
        )}
        {(isRunning || isPaused || isExpired) && (
          <Button
            size="sm"
            variant="outline"
            onClick={timer.reset}
            className={inv
              ? "border-white/70 text-white bg-white/10 hover:bg-white/25"
              : isRunning || isPaused ? "border-border text-foreground" : ""}
          >
            Reset
          </Button>
        )}

        {/* Expired label */}
        {isExpired && (
          <span className="font-bold text-white text-sm uppercase tracking-widest animate-pulse">
            Time!
          </span>
        )}
      </div>
      )}

      {/* Score zone */}
      <div className="flex flex-1 items-stretch">
        {/* Home tap zone */}
        <button
          onClick={() => setDrawerSide("home")}
          className={cn(
            "group flex flex-1 flex-col items-center justify-center gap-3 transition-colors",
            isExpired
              ? "hover:bg-red-500 active:bg-red-500"
              : "hover:bg-muted/50 active:bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={`Record goal for ${activeMatch.homeTeamName}`}
        >
          <div className={cn("text-[clamp(10rem,40vw,24rem)] font-bold leading-none tabular-nums", inv && "text-white")}>
            {activeMatch.homeScore}
          </div>
          <div className={cn("text-sm font-medium transition-colors", inv ? "text-white/80" : "text-muted-foreground group-hover:text-foreground")}>
            {activeMatch.homeTeamName}
          </div>
          <ol className={cn("text-sm list-none space-y-1 text-left", inv ? "text-white/70" : "text-muted-foreground")}>
            {[...homeTeam.players].sort((a, b) => b.seasonPoints - a.seasonPoints).map((p) => (
              <li key={p.id}>
                {p.seasonRank != null ? <span className="opacity-50">#{p.seasonRank} </span> : null}
                {shortName.get(p.id) ?? p.displayName} <span className="opacity-60">({p.seasonPoints} pts)</span>
              </li>
            ))}
            <li className="mt-2 pt-2 border-t border-current/20 font-medium">
              Total: {homeTeam.players.reduce((s, p) => s + p.seasonPoints, 0)} pts
            </li>
            <li className="font-normal opacity-70">
              Avg: {homeTeam.players.length > 0
                ? (homeTeam.players.reduce((s, p) => s + p.seasonPoints, 0) / homeTeam.players.length).toFixed(1)
                : "—"} pts
            </li>
          </ol>
        </button>

        {/* Divider */}
        <div className="flex items-center px-4">
          <span className={cn("text-[clamp(4rem,16vw,10rem)] font-light", inv ? "text-white/50" : "text-muted-foreground")}>:</span>
        </div>

        {/* Away tap zone */}
        <button
          onClick={() => setDrawerSide("away")}
          className={cn(
            "group flex flex-1 flex-col items-center justify-center gap-3 transition-colors",
            isExpired
              ? "hover:bg-red-500 active:bg-red-500"
              : "hover:bg-muted/50 active:bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={`Record goal for ${activeMatch.awayTeamName}`}
        >
          <div className={cn("text-[clamp(10rem,40vw,24rem)] font-bold leading-none tabular-nums", inv && "text-white")}>
            {activeMatch.awayScore}
          </div>
          <div className={cn("text-sm font-medium transition-colors", inv ? "text-white/80" : "text-muted-foreground group-hover:text-foreground")}>
            {activeMatch.awayTeamName}
          </div>
          <ol className={cn("text-sm list-none space-y-1 text-left", inv ? "text-white/70" : "text-muted-foreground")}>
            {[...awayTeam.players].sort((a, b) => b.seasonPoints - a.seasonPoints).map((p) => (
              <li key={p.id}>
                {p.seasonRank != null ? <span className="opacity-50">#{p.seasonRank} </span> : null}
                {shortName.get(p.id) ?? p.displayName} <span className="opacity-60">({p.seasonPoints} pts)</span>
              </li>
            ))}
            <li className="mt-2 pt-2 border-t border-current/20 font-medium">
              Total: {awayTeam.players.reduce((s, p) => s + p.seasonPoints, 0)} pts
            </li>
            <li className="font-normal opacity-70">
              Avg: {awayTeam.players.length > 0
                ? (awayTeam.players.reduce((s, p) => s + p.seasonPoints, 0) / awayTeam.players.length).toFixed(1)
                : "—"} pts
            </li>
          </ol>
        </button>
      </div>

      {/* Goals timeline */}
      {activeMatch.goals.length > 0 && (
        <div className={cn("border-t px-6 py-4", isExpired ? "border-white/20" : "border-border")}>
          <div className="mx-auto max-w-lg space-y-1.5">
            {[...activeMatch.goals].reverse().map((g) => {
              const isHome = g.teamId === activeMatch.homeTeamId
              return (
                <button
                  key={g.id}
                  onClick={() => setEditGoal(g)}
                  className={cn("w-full flex items-center gap-2 text-sm text-left rounded-lg px-2 py-1 transition-colors",
                    inv ? "hover:bg-white/10 text-white/80" : "hover:bg-muted/50"
                  )}
                >
                  <span className="w-12 shrink-0 tabular-nums opacity-60">
                    {format(new Date(g.scoredAt), "HH:mm")}
                  </span>
                  <Badge variant="outline" className={cn("shrink-0", inv && "border-white/40 text-white")}>
                    {isHome ? activeMatch.homeTeamName : activeMatch.awayTeamName}
                  </Badge>
                  <span className="font-medium">{g.scoredByName}</span>
                  {g.assistedByName && <span className="opacity-60">↪ {g.assistedByName}</span>}
                  <span className="ml-auto text-base text-red-400">✎</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Goal drawer */}
      {drawerTeam && (
        <GoalDrawer
          key={drawerTeamId}
          open={drawerSide !== null}
          onOpenChange={(v) => { if (!v) setDrawerSide(null) }}
          matchId={activeMatch.id}
          sessionId={sessionId}
          teamId={drawerTeamId}
          teamName={drawerTeam.name}
          players={drawerTeam.players}
        />
      )}

      {/* Edit goal drawer */}
      {editGoal && (
        <EditGoalDrawer
          key={editGoal.id}
          open={editGoal !== null}
          onOpenChange={(v) => { if (!v) setEditGoal(null) }}
          goal={editGoal}
          matchId={activeMatch.id}
          allPlayers={[...homeTeam.players, ...awayTeam.players]}
        />
      )}
    </div>
  )
}
