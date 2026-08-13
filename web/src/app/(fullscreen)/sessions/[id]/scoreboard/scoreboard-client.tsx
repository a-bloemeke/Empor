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
import { recordGoal, deleteGoal, updateGoal, startMatch } from "@/app/(app)/sessions/[id]/actions"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { disambiguateNames } from "@/lib/game-logic"
import { useTranslations } from "next-intl"

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = { id: string; name: string; displayName: string; seasonPoints: number; seasonSessions: number; seasonScore: number; strength: number; seasonRank: number | null }
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

type PendingMatch = {
  id: string
  roundNumber: number | null
  homeTeamName: string
  awayTeamName: string
  homeTeamPlayers: string[]
  awayTeamPlayers: string[]
}

type Props = {
  sessionId: string
  currentUserId: string
  isOrganizer: boolean
  initialSwapped?: boolean
  activeMatch: ActiveMatch | null
  teams: Team[]
  pendingMatches: PendingMatch[]
}

// ─── Audio & Speech ───────────────────────────────────────────────────────────

function getBestVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  // Prefer natural/enhanced/premium voices, deprioritise "compact" ones
  const langVoices = voices.filter((v) => v.lang.startsWith(lang.split("-")[0]))
  const ranked = [...langVoices].sort((a, b) => {
    const score = (v: SpeechSynthesisVoice) => {
      const n = v.name.toLowerCase()
      if (n.includes("premium") || n.includes("enhanced") || n.includes("neural")) return 3
      if (n.includes("compact") || n.includes("siri")) return 1
      return 2
    }
    return score(b) - score(a)
  })
  return ranked[0] ?? null
}

function speak(text: string, lang = "de-DE", opts: { rate?: number; pitch?: number; volume?: number } = {}) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = lang
    utt.rate = opts.rate ?? 0.78
    utt.pitch = opts.pitch ?? 0.85
    utt.volume = opts.volume ?? 1.0
    const voice = getBestVoice(lang)
    if (voice) utt.voice = voice
    window.speechSynthesis.speak(utt)
  } catch { /* not available */ }
}

// Pre-loaded audio objects — must be created during a user gesture
let whistleAudio: HTMLAudioElement | null = null

function preloadAudio() {
  if (typeof window === "undefined") return
  if (!whistleAudio) {
    whistleAudio = new Audio("/sounds/whistle.wav")
    whistleAudio.load()
  }
}

function playWhistleThenSpeak(_ctx: AudioContext, text: string, lang = "de-DE") {
  try {
    if (whistleAudio) {
      whistleAudio.currentTime = 0
      whistleAudio.play().catch(() => {})
    }
    setTimeout(() => speak(text, lang, { rate: 0.72, pitch: 0.7 }), 2100)
  } catch {
    speak(text, lang, { rate: 0.72, pitch: 0.7 })
  }
}

function playSound(path: string, volume = 1.0) {
  try {
    const audio = new Audio(path)
    audio.volume = volume
    audio.play().catch(() => {/* autoplay blocked */})
  } catch { /* not available */ }
}

// AudioContext created during user gesture in start(), reused for game-over whistle
let sharedAudioCtx: AudioContext | null = null

function playTruckHorn() {
  if (sharedAudioCtx) {
    playWhistleThenSpeak(sharedAudioCtx, "Spiel beendet.", "de-DE")
  } else {
    speak("Spiel beendet.", "de-DE", { rate: 0.72, pitch: 0.7 })
  }
}

function speakLastMinute() {
  speak("Letzte Minute!", "de-DE", { rate: 0.75, pitch: 0.8 })
}

function playLastTenSeconds() {
  try {
    const audio = new Audio("/sounds/last-10-seconds.mp3")
    audio.addEventListener("loadedmetadata", () => {
      if (audio.duration > 0) audio.playbackRate = audio.duration / 10
      audio.play().catch(() => {})
    })
    if (audio.readyState >= 1 && audio.duration > 0) {
      audio.playbackRate = audio.duration / 10
      audio.play().catch(() => {})
    }
  } catch {
    // Audio not available
  }
}

// ─── Timer ────────────────────────────────────────────────────────────────────

const DURATION_OPTIONS = [1, 2, 5, 6, 7, 8, 9, 10]

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
    // Create AudioContext + preload audio during user gesture so iOS allows playback later
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtx && !sharedAudioCtx) sharedAudioCtx = new AudioCtx()
      if (sharedAudioCtx?.state === "suspended") sharedAudioCtx.resume()
    } catch { /* not available */ }
    preloadAudio()
    // iOS Safari requires speechSynthesis to be triggered inside a user gesture.
    // Speak a silent utterance now to unlock the engine for later deferred calls.
    try {
      if (window.speechSynthesis) {
        const unlock = new SpeechSynthesisUtterance(" ")
        unlock.volume = 0
        unlock.lang = "de-DE"
        window.speechSynthesis.speak(unlock)
      }
    } catch { /* not available */ }
    setState("running")
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        const next = r - 1
        // Schedule side effects outside the pure updater
        if (next === 60 && !lastMinuteSpokenRef.current && durationMin > 1) {
          lastMinuteSpokenRef.current = true
          setTimeout(speakLastMinute, 0)
        }
        if (next === 10 && !lastTenPlayedRef.current) {
          lastTenPlayedRef.current = true
          setTimeout(playLastTenSeconds, 0)
        }
        if (next <= 0) {
          clearInterval(intervalRef.current!)
          setState("expired")
          setIsBlinking(true)
          setTimeout(playTruckHorn, 0)
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
  const t = useTranslations("scoreboard")
  const router = useRouter()
  const [scorerId, setScorerId] = useState("")
  const [assisterId, setAssisterId] = useState("")
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) { setScorerId(""); setAssisterId("") }
  }, [open])

  function handleRecord() {
    if (!scorerId) { toast.error(t("selectScorer2")); return }
    startTransition(async () => {
      try {
        await recordGoal(matchId, scorerId, teamId, assisterId || undefined)
        toast.success(t("goalRecorded"))
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
          <h2 className="mb-6 text-lg font-semibold">{t("goalTitle", { team: teamName })}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="block text-center text-lg font-bold uppercase tracking-wide pb-1 border-b-2 border-primary">{t("scorer")}</Label>
              <div className="flex flex-col gap-2">
                {players.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setScorerId(p.id)}
                    className={`rounded-xl border-2 px-4 py-4 text-lg font-semibold text-left transition-colors ${
                      scorerId === p.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/40 hover:bg-muted"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="block text-center text-lg font-bold uppercase tracking-wide pb-1 border-b-2 border-muted-foreground">{t("assist")}</Label>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setAssisterId("")}
                  className={`rounded-xl border-2 px-4 py-4 text-lg font-semibold text-left transition-colors ${
                    assisterId === ""
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/40 hover:bg-muted"
                  }`}
                >
                  {t("noAssist")}
                </button>
                {assistCandidates.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setAssisterId(p.id)}
                    className={`rounded-xl border-2 px-4 py-4 text-lg font-semibold text-left transition-colors ${
                      assisterId === p.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/40 hover:bg-muted"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={pending}>{t("cancel")}</Button>
            <Button className="flex-1" onClick={handleRecord} disabled={pending || !scorerId}>
              {pending ? t("saving") : t("recordGoal")}
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
  allPlayers,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal: GoalEntry
  matchId: string
  allPlayers: Player[]
}) {
  const t = useTranslations("scoreboard")
  const router = useRouter()
  const [scorerId, setScorerId] = useState(goal.id ? "" : "")
  const [assisterId, setAssisterId] = useState("")
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      const scorer = allPlayers.find((p) => p.name === goal.scoredByName || p.displayName === goal.scoredByName)
      const assister = goal.assistedByName
        ? allPlayers.find((p) => p.name === goal.assistedByName || p.displayName === goal.assistedByName)
        : null
      setScorerId(scorer?.id ?? "")
      setAssisterId(assister?.id ?? "")
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSave() {
    if (!scorerId) { toast.error(t("selectScorer2")); return }
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
          <h2 className="mb-4 text-lg font-semibold">{t("editGoal")}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="block text-center text-lg font-bold uppercase tracking-wide pb-1 border-b-2 border-primary">{t("scorer")}</Label>
              <div className="flex flex-col gap-2">
                {allPlayers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setScorerId(p.id)}
                    className={`rounded-xl border-2 px-4 py-4 text-lg font-semibold text-left transition-colors ${
                      scorerId === p.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/40 hover:bg-muted"
                    }`}
                  >
                    {p.displayName}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="block text-center text-lg font-bold uppercase tracking-wide pb-1 border-b-2 border-muted-foreground">{t("assist")}</Label>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setAssisterId("")}
                  className={`rounded-xl border-2 px-4 py-4 text-lg font-semibold text-left transition-colors ${
                    assisterId === ""
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/40 hover:bg-muted"
                  }`}
                >
                  {t("noAssist")}
                </button>
                {assistCandidates.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setAssisterId(p.id)}
                    className={`rounded-xl border-2 px-4 py-4 text-lg font-semibold text-left transition-colors ${
                      assisterId === p.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/40 hover:bg-muted"
                    }`}
                  >
                    {p.displayName}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={pending}>
              {t("remove")}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={pending || !scorerId}>
              {pending ? t("saving") : t("save")}
            </Button>
          </div>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

// ─── Scoreboard ───────────────────────────────────────────────────────────────

export function ScoreboardClient({ sessionId, currentUserId, isOrganizer, initialSwapped = false, activeMatch, teams, pendingMatches }: Props) {
  const t = useTranslations("scoreboard")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [drawerSide, setDrawerSide] = useState<"home" | "away" | null>(null)
  const [editGoal, setEditGoal] = useState<GoalEntry | null>(null)
  const [swapped, setSwapped] = useState(initialSwapped)
  const timer = useMatchTimer(activeMatch?.id ?? "")

  const refresh = useCallback(() => router.refresh(), [router])

  // Auto-refresh every 5 s — pause while drawer is open to avoid losing it
  useEffect(() => {
    if (drawerSide) return
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh, drawerSide])

  function handleStartMatch(matchId: string) {
    startTransition(async () => {
      try {
        await startMatch(matchId)
        router.refresh()
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  if (!activeMatch) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
        <p className="text-muted-foreground text-lg">{t("noActiveMatch")}</p>
        <a href={`/sessions/${sessionId}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">{t("sessionLink")}</a>
        {pendingMatches.length > 0 && (
          <div className="w-full max-w-md space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground text-center mb-3">{t("nextMatches")}</p>
            {pendingMatches.map((m, i) => (
              <div key={m.id} className={`rounded-xl border px-4 py-3 ${i === 0 ? "border-primary/50 bg-primary/5" : "border-border/50 bg-muted/20"}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  {m.roundNumber != null && (
                    <span className="text-xs text-muted-foreground">Runde {m.roundNumber}</span>
                  )}
                  {i === 0 && <span className="text-xs font-bold text-primary ml-auto">{t("nextMatch")}</span>}
                </div>
                <div className="flex items-center gap-3 text-sm font-semibold">
                  <span className="flex-1 truncate">{m.homeTeamName}</span>
                  <span className="text-muted-foreground font-light text-lg">vs</span>
                  <span className="flex-1 text-right truncate">{m.awayTeamName}</span>
                </div>
                <div className="flex gap-4 mt-1.5 text-xs text-muted-foreground">
                  <span className="flex-1 truncate">{m.homeTeamPlayers.join(", ")}</span>
                  <span className="flex-1 text-right truncate">{m.awayTeamPlayers.join(", ")}</span>
                </div>
                {isOrganizer && i === 0 && (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={pending}
                      onClick={() => handleStartMatch(m.id)}
                    >
                      {t("startMatch")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const homeTeamRaw = teams.find((t) => t.id === activeMatch.homeTeamId)!
  const awayTeamRaw = teams.find((t) => t.id === activeMatch.awayTeamId)!
  const leftTeam  = swapped ? awayTeamRaw  : homeTeamRaw
  const rightTeam = swapped ? homeTeamRaw  : awayTeamRaw
  const leftScore  = swapped ? activeMatch.awayScore : activeMatch.homeScore
  const rightScore = swapped ? activeMatch.homeScore : activeMatch.awayScore
  const leftTeamId  = swapped ? activeMatch.awayTeamId : activeMatch.homeTeamId
  const rightTeamId = swapped ? activeMatch.homeTeamId : activeMatch.awayTeamId
  // For the goal drawer we still use "home"/"away" to keep server action compatibility
  const drawerTeam = drawerSide === "home" ? leftTeam : drawerSide === "away" ? rightTeam : null
  const drawerTeamId = drawerSide === "home" ? leftTeamId : rightTeamId

  const shortName = disambiguateNames([...homeTeamRaw.players, ...awayTeamRaw.players].map((p) => ({ id: p.id, name: p.displayName, fullName: p.name })))

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
      <div className="relative flex items-center justify-between px-6 pt-4 pb-2">
        <span className={cn("text-sm", inv ? "text-white/80" : "text-muted-foreground")}>
          {activeMatch.roundNumber != null ? `${t("round", { round: activeMatch.roundNumber })} · ` : ""}
          {activeMatch.homeTeamName} vs {activeMatch.awayTeamName}
        </span>
        {/* Swap button — centered absolutely so it doesn't shift the flanking elements */}
        <button
          onClick={() => setSwapped((s) => !s)}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 text-3xl leading-none px-3 py-1 rounded-lg transition-colors",
            inv
              ? "text-white/70 hover:text-white hover:bg-white/15 active:bg-white/25"
              : "text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80",
          )}
          title="Swap teams left/right"
        >
          ⇄
        </button>
        <a
          href={`/sessions/${sessionId}`}
          className={cn("text-sm underline-offset-4 hover:underline", inv ? "text-white/80" : "text-muted-foreground")}
        >
          {t("sessionLink")}
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
                <SelectItem key={o} value={String(o)}>{t("minOption", { min: o })}</SelectItem>
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
            {t("start")}
          </Button>
        )}
        {isRunning && (
          <Button size="sm" variant="ghost" onClick={timer.pause}>
            {t("pause")}
          </Button>
        )}
        {isPaused && (
          <Button size="sm" onClick={timer.start} className="gap-1.5">
            {t("resume")}
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
            {t("reset")}
          </Button>
        )}

        {/* Expired label */}
        {isExpired && (
          <span className="font-bold text-white text-sm uppercase tracking-widest animate-pulse">
            {t("timeUp")}
          </span>
        )}
      </div>
      )}

      {/* Score zone */}
      <div className="flex flex-1 items-stretch">
        {/* Left tap zone */}
        <button
          onClick={() => setDrawerSide("home")}
          className={cn(
            "group flex flex-1 flex-col items-stretch transition-colors",
            isExpired
              ? "hover:bg-red-500 active:bg-red-500"
              : "hover:bg-muted/50 active:bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={t("recordGoalFor", { team: leftTeam.name })}
        >
          {/* Name + score: flex-1 so both sides occupy identical height, scores center together */}
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className={cn("text-[clamp(1.5rem,5vw,3rem)] font-bold tracking-wide", inv ? "text-white/80" : "text-muted-foreground group-hover:text-foreground")}>
              {leftTeam.name}
            </div>
            <div className={cn("text-[clamp(10rem,40vw,24rem)] font-bold leading-none tabular-nums", inv && "text-white")}>
              {leftScore}
            </div>
          </div>
          {/* Player list pinned to bottom */}
          <ol className={cn("text-sm list-none space-y-1 text-left px-4 pb-4", inv ? "text-white/70" : "text-muted-foreground")}>
            {[...leftTeam.players].sort((a, b) => b.strength - a.strength).map((p) => (
              <li key={p.id}>
                {p.seasonRank != null ? <span className="opacity-50">#{p.seasonRank} </span> : null}
                {shortName.get(p.id) ?? p.displayName} <span className="opacity-60">({p.strength.toFixed(2)})</span>
              </li>
            ))}
            <li className="mt-2 pt-2 border-t border-current/20 font-medium">
              ∑ {leftTeam.players.reduce((s, p) => s + p.strength, 0).toFixed(2)}
            </li>
            <li className="font-normal opacity-70">
              Avg: {leftTeam.players.length > 0
                ? (leftTeam.players.reduce((s, p) => s + p.strength, 0) / leftTeam.players.length).toFixed(2)
                : "—"}
            </li>
          </ol>
        </button>

        {/* Divider */}
        <div className="flex items-center px-4">
          <span className={cn("text-[clamp(4rem,16vw,10rem)] font-light", inv ? "text-white/50" : "text-muted-foreground")}>:</span>
        </div>

        {/* Right tap zone */}
        <button
          onClick={() => setDrawerSide("away")}
          className={cn(
            "group flex flex-1 flex-col items-stretch transition-colors",
            isExpired
              ? "hover:bg-red-500 active:bg-red-500"
              : "hover:bg-muted/50 active:bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={t("recordGoalFor", { team: rightTeam.name })}
        >
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className={cn("text-[clamp(1.5rem,5vw,3rem)] font-bold tracking-wide", inv ? "text-white/80" : "text-muted-foreground group-hover:text-foreground")}>
              {rightTeam.name}
            </div>
            <div className={cn("text-[clamp(10rem,40vw,24rem)] font-bold leading-none tabular-nums", inv && "text-white")}>
              {rightScore}
            </div>
          </div>
          <ol className={cn("text-sm list-none space-y-1 text-left px-4 pb-4", inv ? "text-white/70" : "text-muted-foreground")}>
            {[...rightTeam.players].sort((a, b) => b.strength - a.strength).map((p) => (
              <li key={p.id}>
                {p.seasonRank != null ? <span className="opacity-50">#{p.seasonRank} </span> : null}
                {shortName.get(p.id) ?? p.displayName} <span className="opacity-60">({p.strength.toFixed(2)})</span>
              </li>
            ))}
            <li className="mt-2 pt-2 border-t border-current/20 font-medium">
              ∑ {rightTeam.players.reduce((s, p) => s + p.strength, 0).toFixed(2)}
            </li>
            <li className="font-normal opacity-70">
              Avg: {rightTeam.players.length > 0
                ? (rightTeam.players.reduce((s, p) => s + p.strength, 0) / rightTeam.players.length).toFixed(2)
                : "—"}
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

      {/* Pending matches queue */}
      {pendingMatches.length > 0 && (
        <div className={cn("border-t px-6 py-4", isExpired ? "border-white/20" : "border-border")}>
          <div className="mx-auto max-w-lg space-y-2">
            <p className={cn("text-xs font-bold uppercase tracking-wide mb-2", inv ? "text-white/60" : "text-muted-foreground")}>
              {t("nextMatches")}
            </p>
            {pendingMatches.map((m, i) => (
              <div key={m.id} className={cn(
                "rounded-lg border px-3 py-2",
                i === 0
                  ? inv ? "border-white/40 bg-white/10" : "border-primary/40 bg-primary/5"
                  : inv ? "border-white/20 bg-white/5" : "border-border/50 bg-muted/20"
              )}>
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  {m.roundNumber != null && (
                    <span className={cn("text-xs", inv ? "text-white/50" : "text-muted-foreground")}>Runde {m.roundNumber}</span>
                  )}
                  {i === 0 && (
                    <span className={cn("text-xs font-bold ml-auto", inv ? "text-white/80" : "text-primary")}>{t("nextMatch")}</span>
                  )}
                </div>
                <div className={cn("flex items-center gap-2 text-sm font-semibold", inv ? "text-white" : "text-foreground")}>
                  <span className="flex-1 truncate">{m.homeTeamName}</span>
                  <span className={cn("font-light", inv ? "text-white/40" : "text-muted-foreground")}>vs</span>
                  <span className="flex-1 text-right truncate">{m.awayTeamName}</span>
                </div>
                <div className={cn("flex gap-4 mt-0.5 text-xs", inv ? "text-white/50" : "text-muted-foreground")}>
                  <span className="flex-1 truncate">{m.homeTeamPlayers.join(", ")}</span>
                  <span className="flex-1 text-right truncate">{m.awayTeamPlayers.join(", ")}</span>
                </div>
              </div>
            ))}
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
          allPlayers={[...homeTeamRaw.players, ...awayTeamRaw.players]}
        />
      )}
    </div>
  )
}
