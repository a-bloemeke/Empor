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
import { Textarea } from "@/components/ui/textarea"
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
  cancelRegistrationAdmin,
  generateTeams,
  generateTeamsWithPins,
  movePlayer,
  createEmptyTeam,
  addPlayerToTeam,
  createMatchesFromTeams,
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
  getDefaultInvitation,
  sendInvitation,
  getSummaryEmailDefaults,
  sendSummaryEmail,
  getStatusUpdateDefaults,
  sendStatusUpdate,
  approveRegistration,
  rejectRegistration,
  convertGuestToPlayer,
  addToWaitingList,
  removeFromWaitingList,
  setMaxPlayers,
} from "./actions"
import { registerSelf, maybeSelf, cancelSelf } from "@/app/(app)/schedule/actions"
import type { PointsScope } from "@/lib/types"
import { toast } from "sonner"
import { SportsTable } from "@/components/app/sports-table"
import { disambiguateNames, nextTeamNames, optimalPartition2, computePlayerDeltas } from "@/lib/game-logic"
import type { TeamRef, MatchRef } from "@/lib/game-logic"
import { useTranslations } from "next-intl"

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = { id: string; name: string; displayName: string; seasonPoints: number; seasonSessions: number; seasonScore: number; strength: number; seasonRank: number | null }
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
  beerBringer: boolean
  isGuest: boolean
  seasonPoints: number
  seasonSessions: number
  seasonScore: number
  strength: number
  lifetimePoints: number
  lifetimeSessions: number
  lifetimeScore: number
}
type SessionData = {
  id: string
  date: string
  status: string
  seasonYear: number
  maxPlayers: number | null
  registrations: Registration[]
  teams: Team[]
  matches: Match[]
  allPlayers: Player[]
  absentPlayers: { id: string; name: string }[]
  myStatus: string | null
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

// ─── Convert guest to permanent player dialog ─────────────────────────────────

function ConvertGuestDialog({ playerId, playerName, sessionId }: { playerId: string; playerName: string; sessionId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  function handleConvert() {
    if (!email.trim() || !password) { toast.error("E-Mail und Passwort sind erforderlich."); return }
    startTransition(async () => {
      try {
        await convertGuestToPlayer(playerId, email.trim(), password)
        toast.success(`${playerName} hat jetzt ein Konto.`)
        setOpen(false)
        setEmail("")
        setPassword("")
        router.refresh()
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  const tc = useTranslations("session")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <button className="text-xs px-2 py-0.5 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 disabled:opacity-50" />
      }>
        → Konto
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tc("createAccountTitle", { name: playerName })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="conv-email">E-Mail-Adresse</Label>
            <Input id="conv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conv-pw">Passwort</Label>
            <Input id="conv-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mindestens 6 Zeichen" />
          </div>
          <p className="text-xs text-muted-foreground">Der Spieler erhält eine Willkommens-E-Mail mit dem Login-Link.</p>
        </div>
        <DialogFooter>
          <Button onClick={handleConvert} disabled={pending || !email.trim() || !password}>
            {pending ? tc("creatingAccountBtn") : tc("createAccountBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Registration panel ───────────────────────────────────────────────────────

function RegistrationPanel({
  session,
  isOrganizer,
  currentUserId,
}: {
  session: SessionData
  isOrganizer: boolean
  currentUserId: string
}) {
  const t = useTranslations("session")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [actionId, setActionId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [guestName, setGuestName] = useState("")
  const [editingCap, setEditingCap] = useState(false)
  const [capValue, setCapValue] = useState(String(session.maxPlayers ?? 12))
  const [capConflict, setCapConflict] = useState<{ playerId: string; playerName: string } | null>(null)

  const myStatus = session.myStatus
  const isPlayer = !!currentUserId && !isOrganizer
  const sessionDate = new Date(session.date)
  const isPast = sessionDate < new Date()
  const cutoffPassed = new Date() >= new Date(sessionDate.getTime() - 60 * 60 * 1000)

  function handleSelfRegister() {
    startTransition(async () => {
      try {
        await registerSelf(session.id)
        toast.success("Du bist angemeldet!")
        router.refresh()
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleSelfMaybe() {
    startTransition(async () => {
      try {
        await maybeSelf(session.id)
        toast.success(t("toastMaybe"))
        router.refresh()
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleSelfCancel() {
    startTransition(async () => {
      try {
        await cancelSelf(session.id)
        toast.success("Abgemeldet.")
        router.refresh()
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  const registered = session.registrations.filter((r) => r.status === "REGISTERED")
  const pendingRegs = session.registrations.filter((r) => r.status === "PENDING")
  const waitlisted = session.registrations.filter((r) => r.status === "WAITLISTED")
  const maybe = session.registrations.filter((r) => r.status === "MAYBE")
  const cancelled = session.registrations.filter((r) => r.status === "CANCELLED")
  const respondedIds = new Set(session.registrations.map((r) => r.playerId))
  const absentIds = new Set(session.absentPlayers.map((p) => p.id))
  const noAnswer = session.allPlayers.filter((p) => !respondedIds.has(p.id) && !absentIds.has(p.id))
  const registeredIds = new Set(registered.map((r) => r.playerId))
  const available = session.allPlayers.filter((p) => !registeredIds.has(p.id))
  const isScheduled = session.status === "SCHEDULED"

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

  function handleAdd(playerId: string) {
    // Check cap client-side before hitting the server — avoids unhandled server errors in production
    const cap = session.maxPlayers ?? 12
    if (registered.length >= cap) {
      const playerName = session.allPlayers.find(p => p.id === playerId)?.name
        ?? session.registrations.find(r => r.playerId === playerId)?.playerName
        ?? playerId
      setCapConflict({ playerId, playerName })
      return
    }
    setActionId(playerId)
    startTransition(async () => {
      try {
        await addRegistration(session.id, playerId)
        toast.success("Spieler angemeldet.")
        router.refresh()
      } catch (e) { toast.error((e as Error).message) }
      finally { setActionId(null) }
    })
  }

  function handleCapConflictWaitlist() {
    if (!capConflict) return
    const { playerId } = capConflict
    setCapConflict(null)
    startTransition(async () => {
      try {
        await addToWaitingList(session.id, playerId)
        toast.success("Auf Warteliste gesetzt.")
        router.refresh()
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleCapConflictExtend() {
    if (!capConflict) return
    const { playerId } = capConflict
    const newCap = (session.maxPlayers ?? 12) + 1
    setCapConflict(null)
    startTransition(async () => {
      try {
        await setMaxPlayers(session.id, newCap)
        await addRegistration(session.id, playerId)
        toast.success(`Max. Spieler auf ${newCap} erhöht. Spieler angemeldet.`)
        router.refresh()
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleCancelAdmin(playerId: string) {
    setActionId(playerId)
    startTransition(async () => {
      try {
        await cancelRegistrationAdmin(session.id, playerId)
        toast.success("Spieler abgemeldet.")
      } catch (e) { toast.error((e as Error).message) }
      finally { setActionId(null) }
    })
  }

  function handleApprove(playerId: string) {
    setActionId(playerId)
    startTransition(async () => {
      try {
        await approveRegistration(session.id, playerId)
        toast.success("Anmeldung bestätigt.")
      } catch (e) { toast.error((e as Error).message) }
      finally { setActionId(null) }
    })
  }

  function handleReject(playerId: string) {
    setActionId(playerId)
    startTransition(async () => {
      try {
        await rejectRegistration(session.id, playerId)
        toast.success("Anmeldung abgelehnt.")
      } catch (e) { toast.error((e as Error).message) }
      finally { setActionId(null) }
    })
  }

  function handleAddToWaitlist(playerId: string) {
    setActionId(playerId)
    startTransition(async () => {
      try {
        await addToWaitingList(session.id, playerId)
        toast.success(t("toastWaitlisted"))
      } catch (e) { toast.error((e as Error).message) }
      finally { setActionId(null) }
    })
  }

  function handleRemoveFromWaitlist(playerId: string) {
    setActionId(playerId)
    startTransition(async () => {
      try {
        await removeFromWaitingList(session.id, playerId)
        toast.success(t("toastRemovedFromWaitlist"))
      } catch (e) { toast.error((e as Error).message) }
      finally { setActionId(null) }
    })
  }

  function handleSaveCap() {
    const val = parseInt(capValue, 10)
    if (!val || val < 1) { toast.error("Ungültiger Wert."); return }
    startTransition(async () => {
      try {
        await setMaxPlayers(session.id, val)
        setEditingCap(false)
        toast.success(`Max. Spieler auf ${val} gesetzt.`)
      } catch (e) { toast.error((e as Error).message) }
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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">Angemeldete Spieler ({registered.length})</CardTitle>
            {isScheduled && (
              <TrafficLight count={registered.length} sessionDate={session.date} />
            )}
          </div>
          <div className="flex items-center gap-2">
            {isOrganizer && isScheduled && (
              <SendStatusUpdateDialog sessionId={session.id} registeredCount={registered.length} sessionDate={session.date} />
            )}
            {isOrganizer && available.length > 0 && (
            <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setSelected(new Set()) }}>
              <DialogTrigger render={<Button size="sm" variant="outline" />}>{t("addPlayers")}</DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>{t("addPlayers")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  <label className="flex items-center gap-2 text-sm py-1 cursor-pointer select-none border-b pb-2 mb-1">
                    <input
                      type="checkbox"
                      checked={selected.size === available.length}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border"
                    />
                    <span className="font-medium">{t("selectAll", { count: available.length })}</span>
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
                    {pending ? t("adding") : selected.size > 0 ? `${t("addPlayers")} (${selected.size})` : t("addPlayer_singular")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cap conflict dialog — shown when organizer tries to add to a full list */}
        {capConflict && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 space-y-3">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Die Liste ist voll ({session.maxPlayers ?? 12} Spieler). Was soll mit <span className="font-semibold">{capConflict.playerName}</span> passieren?
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                className="text-xs px-3 py-1.5 rounded border border-blue-300 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 disabled:opacity-50 font-medium"
                disabled={pending}
                onClick={handleCapConflictWaitlist}
              >Auf Warteliste setzen</button>
              <button
                className="text-xs px-3 py-1.5 rounded border border-green-300 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 hover:bg-green-100 disabled:opacity-50 font-medium"
                disabled={pending}
                onClick={handleCapConflictExtend}
              >Max. auf {(session.maxPlayers ?? 12) + 1} erhöhen & anmelden</button>
              <button
                className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:bg-muted"
                onClick={() => setCapConflict(null)}
              >Abbrechen</button>
            </div>
          </div>
        )}

        {/* Self-RSVP row — visible for players when session is open and not in the past */}
        {isPlayer && !isPast && (
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <span className="text-sm font-medium shrink-0">{t("myRegistration")}</span>
            {myStatus === "REGISTERED" && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-700">✅ {t("registeredSection")}</span>
            )}
            {myStatus === "MAYBE" && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700">❓ {t("statusMaybe")}</span>
            )}
            {myStatus === "CANCELLED" && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-700">❌ {t("statusCancelled")}</span>
            )}
            {!myStatus && (
              <span className="text-xs text-muted-foreground">{t("noAnswer")}</span>
            )}
            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              {myStatus !== "REGISTERED" && (
                <button
                  className="text-xs px-2.5 py-1 rounded border border-green-300 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 hover:bg-green-100 disabled:opacity-50 font-medium"
                  disabled={pending}
                  onClick={handleSelfRegister}
                >{t("registerBtn")}</button>
              )}
              {myStatus !== "MAYBE" && (
                <button
                  className="text-xs px-2.5 py-1 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 disabled:opacity-50 font-medium"
                  disabled={pending}
                  onClick={handleSelfMaybe}
                >{t("statusMaybe")}</button>
              )}
              {myStatus !== "CANCELLED" && !cutoffPassed && (
                <button
                  className="text-xs px-2.5 py-1 rounded border border-red-300 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 disabled:opacity-50 font-medium"
                  disabled={pending}
                  onClick={handleSelfCancel}
                >{t("cancelBtn")}</button>
              )}
              {myStatus !== "CANCELLED" && cutoffPassed && (
                <span className="text-xs text-muted-foreground">{t("cancelNotPossible")}</span>
              )}
            </div>
          </div>
        )}

        {/* Pending — awaiting organizer approval */}
        {pendingRegs.length > 0 && (
          <div className={registered.length > 0 ? "border-t border-border/50 pt-3" : ""}>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1.5">
              {t("pendingSection")} ({pendingRegs.length})
            </p>
            <table className="w-full text-sm border-collapse">
              <tbody>
                {pendingRegs.map((r, i) => (
                  <tr key={r.playerId} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                    <td className="py-1 px-2 w-7 text-right text-muted-foreground tabular-nums">{i + 1}.</td>
                    <td className="py-1 px-2 text-amber-700 dark:text-amber-300">
                      {r.playerName}
                      {r.playerId === currentUserId && (
                        <span className="ml-1.5 text-xs text-amber-500">{t("pendingBadge")}</span>
                      )}
                    </td>
                    {isOrganizer && isScheduled && (
                      <td className="py-1 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="text-xs px-2 py-0.5 rounded border border-green-300 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 hover:bg-green-100 disabled:opacity-50"
                            disabled={pending && actionId === r.playerId}
                            onClick={() => handleApprove(r.playerId)}
                          >{t("confirmBtn")}</button>
                          <button
                            className="text-xs px-2 py-0.5 rounded border border-red-300 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 disabled:opacity-50"
                            disabled={pending && actionId === r.playerId}
                            onClick={() => handleReject(r.playerId)}
                          >{t("rejectBtn")}</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Registered */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
              {t("registeredSection")} ({registered.length}/{session.maxPlayers ?? 12})
            </p>
            {isOrganizer && isScheduled && (
              editingCap ? (
                <div className="flex items-center gap-1 ml-auto">
                  <input
                    type="number"
                    min="1"
                    className="w-14 h-6 text-xs border border-border rounded px-1 bg-background"
                    value={capValue}
                    onChange={(e) => setCapValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveCap(); if (e.key === "Escape") setEditingCap(false) }}
                    autoFocus
                  />
                  <button className="text-xs px-1.5 py-0.5 rounded border border-green-300 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 hover:bg-green-100 disabled:opacity-50" disabled={pending} onClick={handleSaveCap}>✓</button>
                  <button className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted" onClick={() => setEditingCap(false)}>✕</button>
                </div>
              ) : (
                <button
                  className="ml-auto text-xs text-amber-600 dark:text-amber-400 hover:underline"
                  onClick={() => { setCapValue(String(session.maxPlayers ?? 12)); setEditingCap(true) }}
                >{t("maxPlayersEdit")}</button>
              )
            )}
          </div>
          {registered.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPlayersYet")}</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <tbody>
                {registered.map((r, i) => (
                  <tr key={r.playerId} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                    <td className="py-1 px-2 w-7 text-right text-muted-foreground tabular-nums">{i + 1}.</td>
                    <td className="py-1 px-2">
                      <span className="flex items-center gap-1">
                        {r.playerName}
                        {r.beerBringer && <span title={t("beerBringerLabel")}>🍺</span>}
                        {r.isGuest && <span className="text-xs text-muted-foreground italic">{t("guestLabel")}</span>}
                      </span>
                    </td>
                    {isOrganizer && (
                      <td className="py-1 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {r.isGuest && (
                            <ConvertGuestDialog playerId={r.playerId} playerName={r.playerName} sessionId={session.id} />
                          )}
                          <button
                            className="text-muted-foreground hover:text-destructive"
                            disabled={pending && actionId === r.playerId}
                            onClick={() => handleRemove(r.playerId)}
                          >×</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Waitlisted */}
        {waitlisted.length > 0 && (
          <div className="border-t border-border/50 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-1.5">
              {t("waitlistedSection")} ({waitlisted.length})
            </p>
            <table className="w-full text-sm border-collapse">
              <tbody>
                {waitlisted.map((r, i) => (
                  <tr key={r.playerId} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                    <td className="py-1 px-2 w-7 text-right text-muted-foreground tabular-nums">{i + 1}.</td>
                    <td className="py-1 px-2 text-blue-700 dark:text-blue-300">
                      {r.playerName}
                      {r.playerId === currentUserId && (
                        <span className="ml-1.5 text-xs text-blue-500">{t("waitlistPosition", { pos: i + 1 })}</span>
                      )}
                    </td>
                    {isOrganizer && isScheduled && (
                      <td className="py-1 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="text-xs px-2 py-0.5 rounded border border-green-300 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 hover:bg-green-100 disabled:opacity-50"
                            disabled={pending && actionId === r.playerId}
                            onClick={() => handleAdd(r.playerId)}
                          >{t("promoteBtn")}</button>
                          <button
                            className="text-xs px-2 py-0.5 rounded border border-red-300 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 disabled:opacity-50"
                            disabled={pending && actionId === r.playerId}
                            onClick={() => handleRemoveFromWaitlist(r.playerId)}
                          >{t("removeFromWaitlistBtn")}</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Cancelled */}
        {/* Maybe */}
        {maybe.length > 0 && (
          <div className="border-t border-border/50 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1.5">
              {t("statusMaybe")} ({maybe.length})
            </p>
            <table className="w-full text-sm border-collapse">
              <tbody>
                {maybe.map((r, i) => (
                  <tr key={r.playerId} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                    <td className="py-1 px-2 w-7 text-right text-muted-foreground tabular-nums">{i + 1}.</td>
                    <td className="py-1 px-2 text-amber-700 dark:text-amber-300">{r.playerName}</td>
                    {isOrganizer && isScheduled && (
                      <td className="py-1 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="text-xs px-2 py-0.5 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 disabled:opacity-50"
                            disabled={pending && actionId === r.playerId}
                            onClick={() => handleAdd(r.playerId)}
                          >{t("promoteBtn")}</button>
                          <button
                            className="text-xs px-2 py-0.5 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 disabled:opacity-50"
                            disabled={pending && actionId === r.playerId}
                            onClick={() => handleCancelAdmin(r.playerId)}
                          >{t("cancelBtn")}</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {cancelled.length > 0 && (
          <div className="border-t border-border/50 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 mb-1.5">
              {t("statusCancelled")} ({cancelled.length})
            </p>
            <table className="w-full text-sm border-collapse">
              <tbody>
                {cancelled.map((r, i) => (
                  <tr key={r.playerId} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                    <td className="py-1 px-2 w-7 text-right text-muted-foreground tabular-nums">{i + 1}.</td>
                    <td className="py-1 px-2 text-muted-foreground">{r.playerName}</td>
                    {isOrganizer && isScheduled && (
                      <td className="py-1 px-2 text-right">
                        <button
                          className="text-xs px-2 py-0.5 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 disabled:opacity-50"
                          disabled={pending && actionId === r.playerId}
                          onClick={() => handleAdd(r.playerId)}
                        >{t("promoteBtn")}</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* No answer */}
        {noAnswer.length > 0 && (
          <div className="border-t border-border/50 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              {t("noAnswerSection")} ({noAnswer.length})
            </p>
            <table className="w-full text-sm border-collapse">
              <tbody>
                {noAnswer.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                    <td className="py-1 px-2 w-7 text-right text-muted-foreground tabular-nums">{i + 1}.</td>
                    <td className="py-1 px-2 text-muted-foreground">{p.name}</td>
                    {isOrganizer && isScheduled && (
                      <td className="py-1 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="text-xs px-2 py-0.5 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 disabled:opacity-50"
                            disabled={pending && actionId === p.id}
                            onClick={() => handleAdd(p.id)}
                          >{t("promoteBtn")}</button>
                          <button
                            className="text-xs px-2 py-0.5 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 disabled:opacity-50"
                            disabled={pending && actionId === p.id}
                            onClick={() => handleCancelAdmin(p.id)}
                          >{t("cancelBtn")}</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Absent players */}
        {session.absentPlayers.length > 0 && (
          <div className="border-t border-border/50 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
              {t("absentSection")} ({session.absentPlayers.length})
            </p>
            <table className="w-full text-sm border-collapse">
              <tbody>
                {session.absentPlayers.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 0 ? "bg-muted/30" : ""}>
                    <td className="py-1 px-2 w-7 text-right text-muted-foreground tabular-nums">{i + 1}.</td>
                    <td className="py-1 px-2 text-slate-400 dark:text-slate-500 italic">{p.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isOrganizer && (
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            <Input
              placeholder={t("guestNamePlaceholder")}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddGuest() }}
              className="flex-1 h-8 text-sm"
            />
            <Button size="sm" variant="outline" disabled={!guestName.trim() || pending} onClick={handleAddGuest}>
              {t("addGuest")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Team-formation preview helpers ──────────────────────────────────────────

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
  const sorted = [...registered].sort((a, b) => b.strength - a.strength)
  return snakeDraft(sorted, numTeams)
}

// ─── New Match Dialog — preview teams before committing ──────────────────────

type NewMatchMode = "RANDOM" | "BALANCED" | "STRENGTH"

function buildNewMatchSplit(registered: Registration[], mode: NewMatchMode): Registration[][] {
  if (mode === "BALANCED" || mode === "STRENGTH") {
    const ratings = registered.map((p) => p.strength)
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
  const t = useTranslations("session")
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
    if (mode === "STRENGTH" || mode === "BALANCED") return p.strength.toFixed(2)
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
        {t("newMatch")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("newMatchFormation")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Mode picker */}
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: "RANDOM",   label: t("random"),    desc: t("shufflePlayers") },
              { value: "BALANCED", label: t("byPoints"),  desc: t("balanceByPoints") },
              { value: "STRENGTH", label: t("byStrength"), desc: t("balanceByStrength") },
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
            {[split[0], split[1]].map((team, ti) => {
              const total = team.reduce((s, p) => s + p.strength, 0)
              const avg = team.length > 0 ? total / team.length : 0
              const showStrength = mode === "STRENGTH" || mode === "BALANCED"
              return (
              <div key={ti} className="rounded-lg border border-border/60 overflow-hidden">
                <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white flex justify-between"
                  style={{ background: "oklch(0.30 0.10 150)" }}
                >
                  <span>{ti === 0 ? nameHome : nameAway}</span>
                  {showStrength && (
                    <span className="font-normal opacity-80">∑ {total.toFixed(2)} · Ø {avg.toFixed(2)}</span>
                  )}
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
            )})}
          </div>
        </div>

        <DialogFooter className="gap-2">
          {mode === "RANDOM" && (
            <Button variant="ghost" disabled={pending} onClick={() => setSeed((s) => s + 1)}>
              ↺ Shuffle again
            </Button>
          )}
          <Button disabled={pending} onClick={handleConfirm}>
            {pending ? t("generating") : t("startMatch")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type InvitationPlayer = { id: string; name: string; email: string; emailNotifications: boolean }
type UsedQuote = { quote: string; author: string; usedAt: Date | string }
type AvailableQuote = { id: string; quote: string; author: string }

function SendInvitationDialog({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [quoteText, setQuoteText] = useState("")
  const [quoteAuthor, setQuoteAuthor] = useState("")
  const [players, setPlayers] = useState<InvitationPlayer[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [usedQuotes, setUsedQuotes] = useState<UsedQuote[]>([])
  const [availableQuotes, setAvailableQuotes] = useState<AvailableQuote[]>([])
  const [loaded, setLoaded] = useState(false)

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen)
    if (isOpen && !loaded) {
      startTransition(async () => {
        try {
          const data = await getDefaultInvitation(sessionId)
          setSubject(data.subject)
          setBody(data.body)
          setPlayers(data.players)
          setSelectedIds(new Set(data.players.filter((p) => p.emailNotifications).map((p) => p.id)))
          setUsedQuotes(data.usedQuotes as UsedQuote[])
          setAvailableQuotes((data.availableQuotes ?? []) as AvailableQuote[])
          setLoaded(true)
        } catch (e) { toast.error((e as Error).message) }
      })
    }
  }

  function togglePlayer(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds((prev) =>
      prev.size === players.length ? new Set() : new Set(players.map((p) => p.id))
    )
  }

  const quoteAlreadyUsed = quoteText.trim() && quoteAuthor.trim() &&
    usedQuotes.some(
      (q) => q.quote.toLowerCase() === quoteText.trim().toLowerCase() &&
             q.author.toLowerCase() === quoteAuthor.trim().toLowerCase()
    )

  function handleSend() {
    if (!subject.trim() || !body.trim()) { toast.error("Subject and message are required."); return }
    if (selectedIds.size === 0) { toast.error("Select at least one recipient."); return }
    if (quoteAlreadyUsed) { toast.error("This quote/author combination was already used. Change it or leave it empty."); return }

    const quote = quoteText.trim() && quoteAuthor.trim()
      ? { text: quoteText.trim(), author: quoteAuthor.trim() }
      : undefined

    startTransition(async () => {
      try {
        const count = await sendInvitation(sessionId, subject.trim(), body.trim(), [...selectedIds], quote)
        toast.success(`Invitation sent to ${count} player${count !== 1 ? "s" : ""}.`)
        setOpen(false)
        setLoaded(false)
        setQuoteText("")
        setQuoteAuthor("")
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        ✉ Send Invitation
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Game Day Invitation</DialogTitle>
        </DialogHeader>
        {pending && !loaded ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : (
          <div className="space-y-4">

            {/* Recipients */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Recipients ({selectedIds.size} / {players.length})</Label>
                <button
                  onClick={toggleAll}
                  className="text-xs text-primary hover:underline"
                >
                  {selectedIds.size === players.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="rounded-lg border border-border max-h-36 overflow-y-auto divide-y divide-border/40">
                {players.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40 select-none">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => togglePlayer(p.id)}
                      className="h-3.5 w-3.5 rounded border"
                    />
                    <span className="flex-1">{p.name}</span>
                    {!p.emailNotifications && <span title="E-Mails deaktiviert" className="text-xs">🔕</span>}
                    <span className="text-xs text-muted-foreground truncate max-w-[140px]">{p.email}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label htmlFor="inv-subject">Subject</Label>
              <Input id="inv-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <Label htmlFor="inv-body">Message</Label>
              <Textarea
                id="inv-body"
                rows={7}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="font-mono text-sm resize-y"
              />
            </div>

            {/* Quote */}
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Optional quote
              </div>
              {availableQuotes.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Pick from collection</Label>
                  <div className="rounded-lg border border-border max-h-44 overflow-y-auto divide-y divide-border/40">
                    {availableQuotes.map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => { setQuoteText(q.quote); setQuoteAuthor(q.author) }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors${quoteText === q.quote && quoteAuthor === q.author ? " bg-muted font-medium" : ""}`}
                      >
                        <span className="italic">„{q.quote}"</span>
                        <span className="ml-1 text-muted-foreground not-italic">— {q.author}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="inv-quote" className="text-sm">Quote</Label>
                <Textarea
                  id="inv-quote"
                  rows={2}
                  placeholder='e.g. "Der Ball ist rund."'
                  value={quoteText}
                  onChange={(e) => setQuoteText(e.target.value)}
                  className="text-sm resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-author" className="text-sm">Author</Label>
                <Input
                  id="inv-author"
                  placeholder="e.g. Sepp Herberger"
                  value={quoteAuthor}
                  onChange={(e) => setQuoteAuthor(e.target.value)}
                />
              </div>
              {quoteText.trim() && quoteAuthor.trim() && (
                <button
                  onClick={() => { setQuoteText(""); setQuoteAuthor("") }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ✕ Clear quote
                </button>
              )}
              {quoteAlreadyUsed && (
                <p className="text-xs text-destructive">
                  This quote by {quoteAuthor} was already used. Pick a different one.
                </p>
              )}
              {usedQuotes.length > 0 && (
                <details className="mt-1">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    Previously used quotes ({usedQuotes.length})
                  </summary>
                  <ul className="mt-1.5 space-y-1">
                    {usedQuotes.map((q, i) => (
                      <li key={i} className="text-xs text-muted-foreground italic">
                        "{q.quote}" — {q.author}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              A "Register now" button linking to this game day is always appended.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button onClick={handleSend} disabled={pending || !loaded || !!quoteAlreadyUsed}>
            {pending ? "Sending…" : `Send to ${selectedIds.size} player${selectedIds.size !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Status Update Email ──────────────────────────────────────────────────────

const MIN_PLAYERS = 8

function TrafficLight({ count, sessionDate }: { count: number; sessionDate: string }) {
  const hoursUntil = (new Date(sessionDate).getTime() - Date.now()) / (1000 * 60 * 60)
  const enough = count >= MIN_PLAYERS
  const critical = !enough && hoursUntil <= 32
  const color = enough ? "#22c55e" : critical ? "#ef4444" : "#eab308"
  const label = enough ? "Findet statt" : critical ? "Droht auszufallen" : "Ungewiss"
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />
      <span className="text-sm font-medium" style={{ color }}>{label}</span>
      <span className="text-sm text-muted-foreground">({count} / {MIN_PLAYERS} Spieler)</span>
    </div>
  )
}

function SendStatusUpdateDialog({ sessionId, registeredCount, sessionDate }: { sessionId: string; registeredCount: number; sessionDate: string }) {
  const t = useTranslations("session")
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [lists, setLists] = useState<{ registered: string[]; maybe: string[]; cancelled: string[]; noAnswer: string[] }>({ registered: [], maybe: [], cancelled: [], noAnswer: [] })
  const [players, setPlayers] = useState<{ id: string; name: string; email: string; emailNotifications: boolean }[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [lastSentAt, setLastSentAt] = useState<string | null>(null)
  const [delta, setDelta] = useState<{ newRegistrations: string[]; newCancellations: string[] } | null>(null)

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen)
    if (isOpen && !loaded) {
      startTransition(async () => {
        try {
          const data = await getStatusUpdateDefaults(sessionId)
          setSubject(data.subject)
          setBody(data.body)
          setLists(data.lists)
          setPlayers(data.players)
          setSelectedIds(new Set(data.players.filter((p) => p.emailNotifications).map((p) => p.id)))
          setLastSentAt(data.lastSentAt)
          setDelta(data.delta)
          setLoaded(true)
        } catch (e) { toast.error((e as Error).message) }
      })
    }
  }

  function togglePlayer(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds((prev) =>
      prev.size === players.length ? new Set() : new Set(players.map((p) => p.id))
    )
  }

  function handleSend() {
    if (!subject.trim()) { toast.error("Betreff ist erforderlich."); return }
    if (selectedIds.size === 0) { toast.error("Mindestens einen Empfänger auswählen."); return }
    startTransition(async () => {
      try {
        const count = await sendStatusUpdate(sessionId, subject.trim(), body, [...selectedIds])
        toast.success(`Status-Update an ${count} Spieler gesendet.`)
        setOpen(false)
        setLoaded(false)
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  function NameTable({ names, colorClass }: { names: string[]; colorClass: string }) {
    if (names.length === 0) return null
    return (
      <table className="w-full text-sm border-collapse">
        <tbody>
          {names.map((name, i) => (
            <tr key={name + i} className={i % 2 === 0 ? "bg-muted/30" : ""}>
              <td className={`py-1 px-2 w-7 text-right tabular-nums text-muted-foreground`}>{i + 1}.</td>
              <td className={`py-1 px-2 ${colorClass}`}>{name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        🚦 Status-Update
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Spieltag-Status an alle senden</DialogTitle>
        </DialogHeader>
        {pending && !loaded ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Lädt…</p>
        ) : (
          <div className="space-y-4">

            <TrafficLight count={registeredCount} sessionDate={sessionDate} />

            {/* Delta since last status email */}
            {lastSentAt && delta && (delta.newRegistrations.length > 0 || delta.newCancellations.length > 0) && (
              <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-3 py-2 text-sm space-y-0.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 mb-1">Neu seit letztem Update</p>
                {delta.newRegistrations.length > 0 && (
                  <p className="text-green-700 dark:text-green-300">✅ +{delta.newRegistrations.length} angemeldet: {delta.newRegistrations.join(", ")}</p>
                )}
                {delta.newCancellations.length > 0 && (
                  <p className="text-red-600 dark:text-red-400">❌ −{delta.newCancellations.length} abgesagt: {delta.newCancellations.join(", ")}</p>
                )}
              </div>
            )}
            {lastSentAt && delta && delta.newRegistrations.length === 0 && delta.newCancellations.length === 0 && (
              <p className="text-xs text-muted-foreground">Keine Änderungen seit letztem Update ({new Date(lastSentAt).toLocaleDateString("de-DE")}).</p>
            )}

            {/* Registration tables */}
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 mb-1">
                  {t("registeredSection")} ({lists.registered.length})
                </p>
                {lists.registered.length === 0
                  ? <p className="text-sm text-muted-foreground">– noch niemand –</p>
                  : <NameTable names={lists.registered} colorClass="" />
                }
              </div>
              {lists.maybe && lists.maybe.length > 0 && (
                <div className="border-t border-border/50 pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1">
                    {t("statusMaybe")} ({lists.maybe.length})
                  </p>
                  <NameTable names={lists.maybe} colorClass="text-amber-700 dark:text-amber-300" />
                </div>
              )}
              {lists.cancelled.length > 0 && (
                <div className="border-t border-border/50 pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 mb-1">
                    {t("statusCancelled")} ({lists.cancelled.length})
                  </p>
                  <NameTable names={lists.cancelled} colorClass="text-muted-foreground" />
                </div>
              )}
              {lists.noAnswer.length > 0 && (
                <div className="border-t border-border/50 pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    {t("noAnswerSection")} ({lists.noAnswer.length})
                  </p>
                  <NameTable names={lists.noAnswer} colorClass="text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Recipients */}
            <div className="space-y-1.5 border-t border-border/50 pt-3">
              <div className="flex items-center justify-between">
                <Label>Empfänger ({selectedIds.size} / {players.length})</Label>
                <button onClick={toggleAll} className="text-xs text-primary hover:underline">
                  {selectedIds.size === players.length ? "Alle abwählen" : "Alle auswählen"}
                </button>
              </div>
              <div className="rounded-lg border border-border max-h-36 overflow-y-auto divide-y divide-border/40">
                {players.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40 select-none">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => togglePlayer(p.id)}
                      className="h-3.5 w-3.5 rounded border"
                    />
                    <span className="flex-1">{p.name}</span>
                    {!p.emailNotifications && <span title="E-Mails deaktiviert" className="text-xs">🔕</span>}
                    <span className="text-xs text-muted-foreground truncate max-w-[140px]">{p.email}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label htmlFor="su-subject">Betreff</Label>
              <Input id="su-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={handleSend} disabled={pending || !loaded}>
            {pending ? "Wird gesendet…" : `Senden an ${selectedIds.size} Spieler`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Game Day Summary ─────────────────────────────────────────────────────────

function buildClientMatchRefs(teams: Team[], matches: Match[]): { teamRefs: TeamRef[]; matchRefs: MatchRef[] } {
  const teamRefs: TeamRef[] = teams.map((t) => ({ id: t.id, playerIds: t.players.map((p) => p.id) }))
  const playersByTeamId = new Map(teams.map((t) => [t.id, t.players.map((p) => p.id)]))
  const matchRefs: MatchRef[] = matches
    .filter((m) => m.status === "COMPLETED")
    .map((m) => ({
      id: m.id,
      roundNumber: m.roundNumber,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      homePlayers: playersByTeamId.get(m.homeTeamId) ?? [],
      awayPlayers: playersByTeamId.get(m.awayTeamId) ?? [],
      goals: m.goals.map((g) => ({ scoredByPlayerId: g.scoredByPlayerId, assistedByPlayerId: g.assistedByPlayerId })),
    }))
  return { teamRefs, matchRefs }
}

type SummaryPlayer = { id: string; name: string; email: string }

function SendSummaryDialog({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [players, setPlayers] = useState<SummaryPlayer[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen)
    if (isOpen && !loaded) {
      startTransition(async () => {
        try {
          const data = await getSummaryEmailDefaults(sessionId)
          setSubject(data.subject)
          setBody(data.body)
          setPlayers(data.players)
          setSelectedIds(new Set(data.players.map((p) => p.id)))
          setLoaded(true)
        } catch (e) { toast.error((e as Error).message) }
      })
    }
  }

  function togglePlayer(id: string) {
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  function toggleAll() {
    setSelectedIds((prev) => prev.size === players.length ? new Set() : new Set(players.map((p) => p.id)))
  }

  function handleSend() {
    if (!subject.trim() || !body.trim()) { toast.error("Subject and message are required."); return }
    if (selectedIds.size === 0) { toast.error("Select at least one recipient."); return }
    startTransition(async () => {
      try {
        const count = await sendSummaryEmail(sessionId, subject.trim(), body.trim(), [...selectedIds])
        toast.success(`Summary sent to ${count} player${count !== 1 ? "s" : ""}.`)
        setOpen(false)
        setLoaded(false)
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        📊 Send Summary
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Game Day Summary</DialogTitle>
        </DialogHeader>
        {pending && !loaded ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Recipients ({selectedIds.size} / {players.length})</Label>
                <button onClick={toggleAll} className="text-xs text-primary hover:underline">
                  {selectedIds.size === players.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="rounded-lg border border-border max-h-36 overflow-y-auto divide-y divide-border/40">
                {players.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40 select-none">
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => togglePlayer(p.id)} className="h-3.5 w-3.5 rounded border" />
                    <span className="flex-1">{p.name}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[160px]">{p.email}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sum-subject">Subject</Label>
              <Input id="sum-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sum-body">Message</Label>
              <Textarea id="sum-body" rows={14} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs resize-y" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={handleSend} disabled={pending || !loaded}>
            {pending ? "Sending…" : `Send to ${selectedIds.size} player${selectedIds.size !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SessionSummary({ session, isOrganizer }: { session: SessionData; isOrganizer: boolean }) {
  const t = useTranslations("session")
  const { teamRefs, matchRefs } = useMemo(
    () => buildClientMatchRefs(session.teams, session.matches),
    [session.teams, session.matches]
  )

  const rows = useMemo(() => {
    const deltas = computePlayerDeltas(teamRefs, matchRefs, "all")
    return [...deltas].sort((a, b) => {
      const sa = a.goals + a.assists + a.points
      const sb = b.goals + b.assists + b.points
      if (sb !== sa) return sb - sa
      if (b.goals !== a.goals) return b.goals - a.goals
      return b.assists - a.assists
    })
  }, [teamRefs, matchRefs])

  const allPlayers = session.teams.flatMap((t) => t.players)
  const shortNames = disambiguateNames(allPlayers.map((p) => ({ id: p.id, name: p.displayName, fullName: p.name })))

  const beerBringerReg = session.registrations.find((r) => r.beerBringer)
  const beerBringerName = beerBringerReg
    ? (shortNames.get(beerBringerReg.playerId) ?? beerBringerReg.playerName)
    : null

  const mvp = rows.length > 0 && (rows[0].goals + rows[0].assists + rows[0].points) > 0 ? rows[0] : null
  const mvpName = mvp ? (shortNames.get(mvp.playerId) ?? mvp.playerId) : null

  if (rows.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t("gameDaySummary")}</CardTitle>
          {isOrganizer && <SendSummaryDialog sessionId={session.id} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {mvp && mvpName && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-white"
            style={{ background: "linear-gradient(135deg, oklch(0.22 0.09 150) 0%, oklch(0.40 0.14 155) 100%)" }}
          >
            <span className="text-2xl">👑</span>
            <div>
              <div className="text-xs font-bold uppercase tracking-wide opacity-70">MVP</div>
              <div className="font-bold">{mvpName}</div>
              <div className="text-xs opacity-80 mt-0.5">
                {t("mvpOutcome", { goals: mvp.goals, assists: mvp.assists, score: mvp.goals + mvp.assists, outcome: mvp.points - 1, points: mvp.points })}
              </div>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>{t("summaryPlayer")}</TableHead>
                <TableHead className="text-right">{t("summaryGoals")}</TableHead>
                <TableHead className="text-right">{t("summaryAssists")}</TableHead>
                <TableHead className="text-right">{t("summaryScore")}</TableHead>
                <TableHead className="text-right">
                  <span className="block leading-tight">{t("summaryOutcome")}</span>
                  <span className="block text-[10px] font-normal opacity-60">{t("summaryOutcomeNote")}</span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="block leading-tight">{t("summaryAttend")}</span>
                  <span className="block text-[10px] font-normal opacity-60">{t("summaryAttendNote")}</span>
                </TableHead>
                <TableHead className="text-right font-semibold">{t("summaryPoints")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => {
                const outcomePts = row.points - 1
                return (
                  <TableRow key={row.playerId} className={i === 0 && mvp ? "font-semibold" : ""}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>{shortNames.get(row.playerId) ?? row.playerId}</TableCell>
                    <TableCell className="text-right">{row.goals}</TableCell>
                    <TableCell className="text-right">{row.assists}</TableCell>
                    <TableCell className="text-right">{row.goals + row.assists}</TableCell>
                    <TableCell className="text-right tabular-nums">{outcomePts > 0 ? `+${outcomePts}` : "—"}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">+1</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{row.points}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        {beerBringerName && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
            <span>🍺</span>
            <span>{t("beerBroughtBy", { name: beerBringerName })}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FormTeamsDialog({
  session,
  pins,
  setPins,
}: {
  session: SessionData
  pins: Record<number, string>
  setPins: React.Dispatch<React.SetStateAction<Record<number, string>>>
}) {
  const t = useTranslations("session")
  const [open, setOpen] = useState(false)
  const [numTeams, setNumTeams] = useState<"2" | "3">("2")
  const [mode, setMode] = useState<"RANDOM" | "BALANCED">("RANDOM")
  const [pending, startTransition] = useTransition()

  const registered = session.registrations.filter((r) => r.status === "REGISTERED")
  const n = parseInt(numTeams) as 2 | 3
  const teamLetters = Array.from({ length: n }, (_, i) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i])

  function setPinForTeam(teamIdx: number, playerId: string) {
    setPins((prev) => {
      const next = { ...prev }
      // Remove this playerId from any other team slot first
      for (const k of Object.keys(next)) {
        if (next[Number(k)] === playerId) delete next[Number(k)]
      }
      if (playerId) next[teamIdx] = playerId
      else delete next[teamIdx]
      return next
    })
  }

  // Convert pins map (teamIndex → playerId) to Record<number, string[]>
  function buildPinsMap(): Record<number, string[]> {
    const result: Record<number, string[]> = {}
    for (const [k, v] of Object.entries(pins)) {
      if (v) result[Number(k)] = [v]
    }
    return result
  }

  const hasPins = Object.keys(pins).length > 0

  function handleGenerate() {
    startTransition(async () => {
      try {
        if (hasPins) {
          await generateTeamsWithPins(session.id, n, mode, buildPinsMap())
        } else {
          await generateTeams(session.id, n, mode)
        }
        toast.success("Teams generated.")
        setOpen(false)
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>{t("formTeams")}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("formTeams")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="space-y-1.5">
              <Label>{t("numberOfTeams")}</Label>
              <Select value={numTeams} onValueChange={(v) => { if (v) { setNumTeams(v as "2" | "3"); setPins({}) } }}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">{t("twoTeams")}</SelectItem>
                  <SelectItem value="3">{t("threeTeams")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("formationMode")}</Label>
              <Select value={mode} onValueChange={(v) => { if (v) setMode(v as "RANDOM" | "BALANCED") }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RANDOM">{t("random")}</SelectItem>
                  <SelectItem value="BALANCED">{t("balanced")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {mode === "BALANCED" ? t("balancedDesc") : t("randomDesc")}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("playersPerTeam", { total: registered.length, min: Math.floor(registered.length / n), max: Math.ceil(registered.length / n) })}
          </p>

          {/* Optional pin section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Spieler fixieren</Label>
              <span className="text-xs text-muted-foreground">(optional)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Wähle bis zu einen Spieler pro Team, der fest zugeteilt wird. Die restlichen Plätze werden ausgelost.
            </p>
            <div className="space-y-2">
              {teamLetters.map((letter, teamIdx) => (
                <div key={teamIdx} className="flex items-center gap-2">
                  <span className="text-xs font-semibold w-16 shrink-0">Team {letter}</span>
                  <Select
                    value={pins[teamIdx] ?? ""}
                    onValueChange={(v) => setPinForTeam(teamIdx, v ?? "")}
                  >
                    <SelectTrigger className="flex-1 text-sm h-8">
                      <SelectValue placeholder="— kein Fixspieler —">
                        {pins[teamIdx]
                          ? registered.find((r) => r.playerId === pins[teamIdx])?.playerName ?? "—"
                          : "— kein Fixspieler —"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— kein Fixspieler —</SelectItem>
                      {registered.map((r) => (
                        <SelectItem
                          key={r.playerId}
                          value={r.playerId}
                          disabled={Object.entries(pins).some(([k, v]) => v === r.playerId && Number(k) !== teamIdx)}
                        >
                          {r.playerName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleGenerate} disabled={pending}>
            {pending ? t("generating") : t("generate")}
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
  pins,
}: {
  session: SessionData
  isOrganizer: boolean
  canRegenerate: boolean
  onDeleteTeam?: (teamId: string) => void
  pins?: Record<number, string>
}) {
  const t = useTranslations("session")
  const [pending, startTransition] = useTransition()
  const [movingPlayer, setMovingPlayer] = useState<{ playerId: string; fromTeamId: string } | null>(null)

  const startedTeamIds = new Set(
    session.matches
      .filter((m) => m.status !== "PENDING")
      .flatMap((m) => [m.homeTeamId, m.awayTeamId])
  )
  const noMatchesStarted = startedTeamIds.size === 0

  // Players registered but not in any team (for empty team assignment)
  const assignedPlayerIds = new Set(session.teams.flatMap((t) => t.players.map((p) => p.id)))
  const unassigned = session.registrations.filter(
    (r) => r.status === "REGISTERED" && !assignedPlayerIds.has(r.playerId)
  )

  function handleRegenerate(mode: "RANDOM" | "BALANCED") {
    startTransition(async () => {
      try {
        const numTeams = session.teams.length as 2 | 3
        // Build pins from current teams: for each team index, if a pin exists for that slot, keep it fixed
        if (pins && Object.keys(pins).length > 0) {
          // Validate pins still exist in current registrations
          const registeredIds = new Set(session.registrations.filter((r) => r.status === "REGISTERED").map((r) => r.playerId))
          const validPins: Record<number, string[]> = {}
          for (const [k, v] of Object.entries(pins)) {
            if (v && registeredIds.has(v)) validPins[Number(k)] = [v]
          }
          await generateTeamsWithPins(session.id, numTeams, mode, validPins)
        } else {
          await generateTeams(session.id, numTeams, mode)
        }
        toast.success(`Teams regenerated (${mode === "BALANCED" ? "balanced" : "random"}).`)
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleMovePlayer(toTeamId: string) {
    if (!movingPlayer) return
    const { playerId, fromTeamId } = movingPlayer
    setMovingPlayer(null)
    startTransition(async () => {
      try {
        await movePlayer(session.id, playerId, fromTeamId, toTeamId)
        toast.success("Spieler verschoben.")
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleAssignUnassigned(playerId: string, toTeamId: string) {
    startTransition(async () => {
      try {
        // Create a temporary "from" by adding to a dummy team — instead use addToTeam directly
        // Since movePlayer requires fromTeamId, we need a different approach for unassigned players.
        // We'll reuse movePlayer by first finding if there's a way, or use a direct DB insert.
        // Actually the cleanest: we already have the teamPlayer create in the transaction.
        // Let's call movePlayer with fromTeamId="" as a signal — but that won't work.
        // Instead we'll add a lightweight addPlayerToTeam server action.
        await addPlayerToTeam(session.id, playerId, toTeamId)
        toast.success("Spieler zugewiesen.")
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  function handleCreateEmptyTeam() {
    startTransition(async () => {
      try {
        await createEmptyTeam(session.id)
        toast.success("Leeres Team erstellt.")
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <div className="space-y-4">
      {/* Move-player destination overlay */}
      {movingPlayer && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">Zu welchem Team verschieben?</span>
          {session.teams
            .filter((t) => t.id !== movingPlayer.fromTeamId)
            .map((t) => (
              <Button key={t.id} size="sm" variant="outline" onClick={() => handleMovePlayer(t.id)}>
                {t.name}
              </Button>
            ))}
          <Button size="sm" variant="ghost" onClick={() => setMovingPlayer(null)}>Abbrechen</Button>
        </div>
      )}

      {/* Unassigned players — shown when there are empty/partial teams */}
      {isOrganizer && noMatchesStarted && unassigned.length > 0 && session.teams.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Nicht zugewiesen ({unassigned.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((r) => (
              <div key={r.playerId} className="flex items-center gap-1">
                <span className="text-sm">{r.playerName}</span>
                <span className="text-xs text-muted-foreground">→</span>
                {session.teams.map((team) => (
                  <button
                    key={team.id}
                    className="text-xs px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 border border-border transition-colors"
                    onClick={() => handleAssignUnassigned(r.playerId, team.id)}
                    disabled={pending}
                  >
                    {team.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

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
                    title={t("deleteTeamTitle")}
                  >
                    {t("deleteTeam")}
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
                    <span className="text-xs text-muted-foreground tabular-nums" title="Strength = 0.6 × win pts/GD + 0.4 × score/GD">
                      {p.strength.toFixed(2)}
                    </span>
                    {isOrganizer && noMatchesStarted && session.teams.length > 1 && (
                      <button
                        className={`text-xs px-1.5 py-0.5 rounded transition-colors ${movingPlayer?.playerId === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                        onClick={() => setMovingPlayer(
                          movingPlayer?.playerId === p.id ? null : { playerId: p.id, fromTeamId: team.id }
                        )}
                        title="Spieler verschieben"
                      >
                        →
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-2 pt-2 border-t border-border/40 space-y-0.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span title="Strength = 0.6 × win pts/GD + 0.4 × score/GD">{t("total")} ⚡</span>
                  <span className="font-semibold tabular-nums">
                    {team.players.reduce((s, p) => s + p.strength, 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t("avg")} ⚡</span>
                  <span className="tabular-nums">
                    {team.players.length > 0
                      ? (team.players.reduce((s, p) => s + p.strength, 0) / team.players.length).toFixed(2)
                      : "—"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        ⚡ Strength = 0.6 × win pts/GD + 0.4 × score/GD (goals+assists per game day)
      </p>
      {isOrganizer && canRegenerate && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => handleRegenerate("RANDOM")}>
            Shuffle randomly
          </Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => handleRegenerate("BALANCED")}>
            Balance by rating
          </Button>
          {noMatchesStarted && (
            <Button variant="outline" size="sm" disabled={pending} onClick={handleCreateEmptyTeam}>
              + Team hinzufügen
            </Button>
          )}
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
  const t = useTranslations("session")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [scorerId, setScorerId] = useState("")
  const [assisterId, setAssisterId] = useState("")
  const [pending, startTransition] = useTransition()

  function handleRecord() {
    if (!scorerId) { toast.error(t("selectScorer")); return }
    startTransition(async () => {
      try {
        await recordGoal(matchId, scorerId, teamId, assisterId || undefined)
        toast.success(t("goalRecorded"))
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
          <DialogTitle>{t("recordGoal")} — {teamName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("scorer")}</Label>
            <Select value={scorerId} onValueChange={(v) => { if (v !== null) setScorerId(v) }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("selectScorerPlaceholder")}>
                  {(v: string) => players.find((p) => p.id === v)?.name ?? t("selectScorerPlaceholder")}
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
            <Label>{t("assist")}</Label>
            <Select value={assisterId} onValueChange={(v) => setAssisterId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("noAssist")}>
                  {(v: string) => v ? (assistCandidates.find((p) => p.id === v)?.name ?? t("noAssist")) : t("noAssist")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("noAssist")}</SelectItem>
                {assistCandidates.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleRecord} disabled={pending || !scorerId}>
            {pending ? t("adding") : t("recordGoal")}
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
  const t = useTranslations("session")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [swapped, setSwapped] = useState(false)

  const homeTeamRaw = session.teams.find((t) => t.id === match.homeTeamId)!
  const awayTeamRaw = session.teams.find((t) => t.id === match.awayTeamId)!
  const leftTeam  = swapped ? awayTeamRaw  : homeTeamRaw
  const rightTeam = swapped ? homeTeamRaw  : awayTeamRaw
  const leftScore  = swapped ? match.awayScore : match.homeScore
  const rightScore = swapped ? match.homeScore : match.awayScore

  function handleDeleteGoal(goalId: string) {
    startTransition(async () => {
      try { await deleteGoal(goalId); router.refresh() }
      catch (e) { toast.error((e as Error).message) }
    })
  }

  // Disambiguated display names across both teams (uses displayName, not full name)
  const allPlayers = [...homeTeamRaw.players, ...awayTeamRaw.players]
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
          <button
            onClick={() => setSwapped((s) => !s)}
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors text-base"
            title="Swap teams left/right"
          >
            ⇄
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-center gap-4 sm:gap-8 py-4">
          <div className="flex flex-col items-center flex-1">
            <div className="text-4xl font-bold text-center">{leftScore}</div>
            <div className="text-sm text-muted-foreground mt-1 text-center">{leftTeam.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5 text-center">
              {leftTeam.players.map((p) => (
                <div key={p.id}>
                  {p.seasonRank != null ? <span className="opacity-60">#{p.seasonRank} </span> : null}
                  {shortName.get(p.id) ?? p.displayName}
                  <span className="opacity-60" title="Strength = 0.6 × win pts/GD + 0.4 × score/GD"> · {p.strength.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-2xl font-light text-muted-foreground shrink-0">–</div>
          <div className="flex flex-col items-center flex-1">
            <div className="text-4xl font-bold text-center">{rightScore}</div>
            <div className="text-sm text-muted-foreground mt-1 text-center">{rightTeam.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5 text-center">
              {rightTeam.players.map((p) => (
                <div key={p.id}>
                  {p.seasonRank != null ? <span className="opacity-60">#{p.seasonRank} </span> : null}
                  {shortName.get(p.id) ?? p.displayName}
                  <span className="opacity-60" title="Strength = 0.6 × win pts/GD + 0.4 × score/GD"> · {p.strength.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {atLimit && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
            {t("tenGoalsReached")}
          </div>
        )}

        {/* Goal recording buttons */}
        <div className="flex flex-wrap gap-2">
          <GoalDialog
            matchId={match.id}
            sessionId={session.id}
            teamId={leftTeam.id}
            teamName={leftTeam.name}
            players={leftTeam.players}
          />
          <GoalDialog
            matchId={match.id}
            sessionId={session.id}
            teamId={rightTeam.id}
            teamName={rightTeam.name}
            players={rightTeam.players}
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
                {t("endMatchTenGoals")}
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={pending} onClick={handleEndTime}>
              {t("endMatchTime")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StandingsTable({ teams, matches }: { teams: Team[]; matches: Match[] }) {
  const t = useTranslations("session")
  const standings = computeStandings(teams, matches)
  return (
    <SportsTable title={t("standings")}>
      <div className="overflow-x-auto">
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("team")}</TableHead>
          <TableHead className="text-right">{t("played")}</TableHead>
          <TableHead className="text-right">{t("pts")}</TableHead>
          <TableHead className="text-right hidden sm:table-cell">{t("gf")}</TableHead>
          <TableHead className="text-right hidden sm:table-cell">{t("ga")}</TableHead>
          <TableHead className="text-right">{t("gd")}</TableHead>
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
            <TableCell className="text-right hidden sm:table-cell">{s.gf}</TableCell>
            <TableCell className="text-right hidden sm:table-cell">{s.ga}</TableCell>
            <TableCell className="text-right">{s.gf - s.ga > 0 ? "+" : ""}{s.gf - s.ga}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
    </SportsTable>
  )
}

function MatchSummary({ match, onReopen, onDeleteGoal }: { match: Match; onReopen?: () => void; onDeleteGoal?: (id: string) => void }) {
  const t = useTranslations("session")
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
            {t("reopenMatch")}
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── End session dialog (for mixed tournament+normal sessions) ────────────────

function EndSessionDialog({ onConfirm, disabled }: { onConfirm: (scope: PointsScope) => void; disabled: boolean }) {
  const t = useTranslations("session")
  const [open, setOpen] = useState(false)
  const opts: { scope: PointsScope; label: string; desc: string }[] = [
    { scope: "all",        label: t("allMatches"),       desc: t("allMatchesDesc") },
    { scope: "tournament", label: t("tournamentOnly"),   desc: t("tournamentOnlyDesc") },
    { scope: "normal",     label: t("normalOnly"),       desc: t("normalOnlyDesc") },
    { scope: "none",       label: t("goalsAssistsOnly"), desc: t("goalsAssistsOnlyDesc") },
  ]
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={disabled} />}>
        {t("endGameDay")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("endGameDayTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("endGameDayDesc")}
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
  const t = useTranslations("session")
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={disabled} />}>
        {t("switchToNormalPlay")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>{t("switchToNormalPlay")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("switchToNormalPlayDesc")}
        </p>
        <DialogFooter className="flex-col gap-2">
          <Button onClick={() => { onConfirm("RANDOM"); setOpen(false) }}>
            {t("randomTeams")}
          </Button>
          <Button variant="outline" onClick={() => { onConfirm("BALANCED"); setOpen(false) }}>
            {t("balancedTeams")}
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
  const t = useTranslations("session")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [pins, setPins] = useState<Record<number, string>>({})

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
              {session.status === "IN_PROGRESS" ? t("statusLive") :
               session.status === "COMPLETED" ? (startedAsTournament ? t("tournamentComplete") : t("completed")) :
               session.status === "CANCELLED" ? t("cancelled") : t("statusScheduled")}
            </span>
            {startedAsTournament && session.status !== "SCHEDULED" && (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-white/10 text-white/70 border border-white/15">
              🏆 {t("tournamentTeams", { count: session.teams.length })}
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
        <p className="text-muted-foreground">{t("gameDayCancelled")}</p>
      )}

      {/* SCHEDULED — no teams yet */}
      {session.status === "SCHEDULED" && session.teams.length === 0 && (
        <div className="space-y-4">
          <RegistrationPanel session={session} isOrganizer={isOrganizer} currentUserId={currentUserId} />
          {isOrganizer && (
            <div className="flex flex-wrap gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
              <FormTeamsDialog session={session} pins={pins} setPins={setPins} />
              <Button size="sm" variant="outline" disabled={pending} onClick={() => {
                startTransition(async () => {
                  try { await createEmptyTeam(session.id); toast.success("Leeres Team erstellt.") }
                  catch (e) { toast.error((e as Error).message) }
                })
              }}>
                + Team hinzufügen
              </Button>
              <SendInvitationDialog sessionId={session.id} />
            </div>
          )}
        </div>
      )}

      {/* SCHEDULED — teams exist */}
      {session.status === "SCHEDULED" && session.teams.length > 0 && (
        <div className="space-y-4">
          <RegistrationPanel session={session} isOrganizer={isOrganizer} currentUserId={currentUserId} />
          <SectionHeader title="Teams" />
          <TeamsView session={session} isOrganizer={isOrganizer} canRegenerate={true} onDeleteTeam={isOrganizer ? handleDeleteTeam : undefined} pins={pins} />
          {isOrganizer && (
            <div className="flex flex-wrap gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
              <FormTeamsDialog session={session} pins={pins} setPins={setPins} />
              <SendInvitationDialog sessionId={session.id} />
              {pendingMatches.length === 0 && session.teams.length >= 2 && session.teams.length <= 3 && (
                <Button size="sm" disabled={pending} onClick={() => {
                  startTransition(async () => {
                    try {
                      await createMatchesFromTeams(session.id)
                      toast.success("Spiele erstellt.")
                    } catch (e) { toast.error((e as Error).message) }
                  })
                }}>
                  {session.teams.length === 3 ? t("startRound1") : t("startMatch")}
                </Button>
              )}
              {pendingMatches.length > 0 && (
                <Button size="sm" disabled={pending} onClick={() => handleStartMatch(pendingMatches[0].id)}>
                  {startedAsTournament && completedMatches.length === 0 ? t("startRound1") : t("startMatch")}
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
                  {t("openScoreboard")}
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
                      <Button size="sm" disabled={pending} onClick={() => handleStartMatch(pendingMatches[0].id)}
                        className="border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                        variant="outline"
                      >
                        {t("startMatch")}
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
            <div className="flex flex-wrap gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
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
            <div className="flex flex-wrap gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
              {startedAsTournament && (
                <div className="w-full text-xs text-muted-foreground mb-1 italic">
                  {t("tournamentPaused")}
                </div>
              )}
              <Button size="sm" disabled={pending} onClick={handleRematch}>
                {t("rematch")}
              </Button>
              <NewMatchDialog session={session} disabled={pending} />
              {startedAsTournament ? (
                <EndSessionDialog onConfirm={handleEndSession} disabled={pending} />
              ) : (
                <Button variant="outline" size="sm" disabled={pending} onClick={() => handleEndSession("all")}>
                  {t("endGameDay")}
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
                      {t("normalPlay")}
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

          <SessionSummary session={session} isOrganizer={isOrganizer} />

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
              {t("reopenGameDay")}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
