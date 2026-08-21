"use client"

import { useState, useTransition } from "react"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createSession, cancelSession, registerSelf, cancelSelf, maybeSelf, toggleBeer, getCancelEmailDefaults, sendCancelEmail, reopenCancelledSession, revalidateSchedule, endSession } from "./actions"
import { toast } from "sonner"
import Link from "next/link"
import { useTranslations } from "next-intl"

type GameSession = {
  id: string
  date: string
  status: string
  seasonYear: number
  registrationCount: number
  maxPlayers: number | null
  myStatus: string | null
  beerBringerId: string | null
  beerBringerName: string | null
  myBeer: boolean
}

type HallClosure = {
  id: string
  startDate: string
  endDate: string
  reason: string | null
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("schedule")
  if (status === "SCHEDULED") return <Badge>{t("statusScheduled")}</Badge>
  if (status === "IN_PROGRESS") return <Badge className="bg-primary text-primary-foreground">{t("statusLive")}</Badge>
  if (status === "COMPLETED") return <Badge variant="secondary">{t("statusCompleted")}</Badge>
  return <Badge variant="outline">{t("statusCancelled")}</Badge>
}

function MyStatusBadge({ status }: { status: string | null }) {
  const t = useTranslations("schedule")
  if (status === "REGISTERED") return <Badge variant="secondary">{t("statusRegistered")}</Badge>
  if (status === "CANCELLED") return <span className="text-muted-foreground text-sm">{t("statusCancelled")}</span>
  if (status === "MAYBE") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300">{t("statusMaybe")}</Badge>
  if (status === "WAITLISTED") return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300">{t("statusWaitlisted")}</Badge>
  if (status === "PENDING") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300">{t("statusPending")}</Badge>
  return <span className="text-muted-foreground text-sm">—</span>
}

// ─── Cancel Game Day Dialog ───────────────────────────────────────────────────

type CancelPlayer = { id: string; name: string; email: string; emailNotifications: boolean }

function CancelGameDayDialog({
  sessionId,
  onCancelled,
}: {
  sessionId: string
  onCancelled: () => void
}) {
  const t = useTranslations("schedule")
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"confirm" | "email">("confirm")
  const [pending, startTransition] = useTransition()
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [players, setPlayers] = useState<CancelPlayer[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen)
    if (!isOpen) {
      setStep("confirm")
      setLoaded(false)
    }
  }

  function handleConfirmCancel() {
    startTransition(async () => {
      try {
        await cancelSession(sessionId)
        onCancelled()
        // load email defaults
        const data = await getCancelEmailDefaults(sessionId)
        setSubject(data.subject)
        setBody(data.body)
        setPlayers(data.players)
        setSelectedIds(new Set(data.players.filter((p) => p.emailNotifications).map((p) => p.id)))
        setLoaded(true)
        setStep("email")
      } catch (e) {
        toast.error((e as Error).message)
        setOpen(false)
      }
    })
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

  function handleSendEmail() {
    startTransition(async () => {
      try {
        const count = await sendCancelEmail(sessionId, subject.trim(), body.trim(), [...selectedIds])
        toast.success(t("cancelEmailSent", { count }))
        setOpen(false)
        await revalidateSchedule()
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  function handleSkipEmail() {
    toast.success(t("gameDayCancelled"))
    setOpen(false)
    startTransition(async () => { await revalidateSchedule() })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        {t("cancelGameDay")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {step === "confirm" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("cancelGameDayTitle")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t("cancelGameDayConfirm")}</p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                {t("back")}
              </Button>
              <Button variant="destructive" onClick={handleConfirmCancel} disabled={pending}>
                {pending ? t("cancelling") : t("confirmCancel")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("cancelEmailTitle")}</DialogTitle>
            </DialogHeader>
            {!loaded ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t("loading")}</p>
            ) : (
              <div className="space-y-4">
                {/* Recipients */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>{t("recipients", { selected: selectedIds.size, total: players.length })}</Label>
                    <button onClick={toggleAll} className="text-xs text-primary hover:underline">
                      {selectedIds.size === players.length ? t("deselectAll") : t("selectAll")}
                    </button>
                  </div>
                  <div className="rounded-lg border border-border max-h-40 overflow-y-auto divide-y divide-border/40">
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
                  <Label htmlFor="cancel-subject">{t("subject")}</Label>
                  <Input id="cancel-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>

                {/* Body */}
                <div className="space-y-1.5">
                  <Label htmlFor="cancel-body">{t("message")}</Label>
                  <Textarea
                    id="cancel-body"
                    rows={10}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="font-mono text-sm resize-y"
                  />
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={handleSkipEmail} disabled={pending}>
                {t("skipEmail")}
              </Button>
              <Button onClick={handleSendEmail} disabled={pending || !loaded || selectedIds.size === 0}>
                {pending ? t("sending") : t("sendCancelEmail", { count: selectedIds.size })}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function ScheduleClient({
  upcoming,
  past,
  isOrganizer,
  currentUserId,
  closures,
}: {
  upcoming: GameSession[]
  past: GameSession[]
  isOrganizer: boolean
  currentUserId: string
  closures: HallClosure[]
}) {
  const t = useTranslations("schedule")
  const [open, setOpen] = useState(false)
  const [dateValue, setDateValue] = useState("")
  const [maxPlayersValue, setMaxPlayersValue] = useState("")
  const [creating, setCreating] = useState(false)
  const [pending, startTransition] = useTransition()
  const [actionId, setActionId] = useState<string | null>(null)
  const isLoggedIn = currentUserId !== ""

  async function handleCreate() {
    if (!dateValue) { toast.error(t("pickDateTime")); return }
    const maxPlayers = maxPlayersValue ? parseInt(maxPlayersValue, 10) : undefined
    setCreating(true)
    try {
      await createSession(new Date(dateValue).toISOString(), maxPlayers)
      toast.success(t("gameDayScheduled"))
      setOpen(false)
      setDateValue("")
      setMaxPlayersValue("")
    } catch (e) {
      toast.error((e as Error).message || "Fehler beim Planen des Spieltags.")
    } finally {
      setCreating(false)
    }
  }

  function handleRegister(id: string) {
    setActionId(id)
    startTransition(async () => {
      try {
        await registerSelf(id)
        toast.success(t("youAreRegistered"))
      } catch (e) {
        toast.error((e as Error).message)
      } finally { setActionId(null) }
    })
  }

  function handleCancelReg(id: string) {
    setActionId(id)
    startTransition(async () => {
      try {
        await cancelSelf(id)
        toast.success(t("registrationCancelled"))
      } catch (e) {
        toast.error((e as Error).message)
      } finally { setActionId(null) }
    })
  }

  function handleMaybe(id: string) {
    setActionId(id)
    startTransition(async () => {
      try {
        await maybeSelf(id)
        toast.success(t("statusMaybe"))
      } catch (e) {
        toast.error((e as Error).message)
      } finally { setActionId(null) }
    })
  }

  function handleToggleBeer(id: string) {
    setActionId(id)
    startTransition(async () => {
      try {
        await toggleBeer(id)
        toast.success(t("beerToggled"))
      } catch (e) {
        toast.error((e as Error).message)
      } finally { setActionId(null) }
    })
  }

  function handleReopen(id: string) {
    setActionId(id)
    startTransition(async () => {
      try {
        await reopenCancelledSession(id)
        toast.success(t("gameDayReopened"))
      } catch (e) {
        toast.error((e as Error).message)
      } finally { setActionId(null) }
    })
  }

  function handleEndSession(id: string) {
    setActionId(id)
    startTransition(async () => {
      try {
        await endSession(id)
        toast.success(t("gameDayCompleted"))
      } catch (e) {
        toast.error((e as Error).message)
      } finally { setActionId(null) }
    })
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 text-white"
          style={{ background: "linear-gradient(90deg, oklch(0.20 0.07 150), oklch(0.35 0.12 150))" }}
        >
          <h2 className="font-bold tracking-wide uppercase text-xs">{t("upcomingGameDays")}</h2>
          {isOrganizer && (
            <Dialog open={open} onOpenChange={(v) => {
              setOpen(v)
              if (v && !dateValue) {
                const d = new Date()
                const pad = (n: number) => String(n).padStart(2, "0")
                setDateValue(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T20:00`)
                setMaxPlayersValue("")
              }
            }}>
              <DialogTrigger render={<Button size="sm" className="bg-white/20 text-white hover:bg-white/30 border-0" />}>{t("newGameDay")}</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("scheduleGameDay")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-1.5">
                  <Label htmlFor="session-date">{t("dateTime")}</Label>
                  <Input
                    id="session-date"
                    type="datetime-local"
                    value={dateValue}
                    onChange={(e) => setDateValue(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="session-max-players">{t("maxPlayersLabel")}</Label>
                  <Input
                    id="session-max-players"
                    type="number"
                    min="1"
                    placeholder={t("maxPlayersPlaceholder")}
                    value={maxPlayersValue}
                    onChange={(e) => setMaxPlayersValue(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? t("scheduling") : t("schedule")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {upcoming.length === 0 && closures.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">{t("noUpcomingGameDays")}</p>
        ) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("date")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("season")}</TableHead>
                <TableHead className="text-right">{t("players")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("status")}</TableHead>
                {isLoggedIn && <TableHead className="hidden sm:table-cell">{t("you")}</TableHead>}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                type Item =
                  | { kind: "session"; data: GameSession; sortDate: string }
                  | { kind: "closure"; data: HallClosure; sortDate: string }
                const items: Item[] = [
                  ...upcoming.map((s) => ({ kind: "session" as const, data: s, sortDate: s.date })),
                  ...closures.map((c) => ({ kind: "closure" as const, data: c, sortDate: c.startDate })),
                ].sort((a, b) => new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime())

                return items.map((item) => {
                  if (item.kind === "closure") {
                    const c = item.data
                    const sameDay = c.startDate.slice(0, 10) === c.endDate.slice(0, 10)
                    const dateLabel = sameDay
                      ? format(new Date(c.startDate), "EEE, d MMM yyyy")
                      : `${format(new Date(c.startDate), "d. MMM")} – ${format(new Date(c.endDate), "d. MMM yyyy")}`
                    const colSpan = isLoggedIn ? 5 : 4
                    return (
                      <TableRow key={`closure-${c.id}`} className="bg-red-50 dark:bg-red-950/20 hover:bg-red-100/60 dark:hover:bg-red-950/30">
                        <TableCell colSpan={colSpan} className="font-medium text-red-700 dark:text-red-400">
                          <span className="mr-1.5">🔒</span>
                          <span className="hidden sm:inline">{dateLabel}</span>
                          <span className="sm:hidden">{format(new Date(c.startDate), "dd.MM.")}{!sameDay ? ` – ${format(new Date(c.endDate), "dd.MM.")}` : ""}</span>
                          {c.reason && (
                            <span className="ml-2 text-xs font-normal text-red-500 dark:text-red-400/70">({c.reason})</span>
                          )}
                          <span className="ml-2 text-xs font-normal hidden sm:inline bg-red-200 dark:bg-red-800/40 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded">
                            {t("hallClosure")}
                          </span>
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    )
                  }

                  const s = item.data
                  const withinCutoff = new Date() >= new Date(new Date(s.date).getTime() - 60 * 60 * 1000)
                  const busy = pending && actionId === s.id

                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {isLoggedIn ? (
                          <Link href={`/sessions/${s.id}`} className="hover:underline">
                            <span className="hidden sm:inline">{format(new Date(s.date), "EEE, d MMM yyyy · HH:mm")}</span>
                            <span className="sm:hidden">{format(new Date(s.date), "dd.MM. · HH:mm")}</span>
                          </Link>
                        ) : (
                          <>
                            <span className="hidden sm:inline">{format(new Date(s.date), "EEE, d MMM yyyy · HH:mm")}</span>
                            <span className="sm:hidden">{format(new Date(s.date), "dd.MM. · HH:mm")}</span>
                          </>
                        )}
                        <div className="sm:hidden flex items-center gap-1.5 mt-0.5">
                          <StatusBadge status={s.status} />
                          {isLoggedIn && <MyStatusBadge status={s.myStatus} />}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{s.seasonYear}</TableCell>
                      <TableCell className="text-right">{s.registrationCount}{s.maxPlayers ? `/${s.maxPlayers}` : ""}</TableCell>
                      <TableCell className="hidden sm:table-cell"><StatusBadge status={s.status} /></TableCell>
                      {isLoggedIn && <TableCell className="hidden sm:table-cell"><MyStatusBadge status={s.myStatus} /></TableCell>}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {isLoggedIn && s.status === "SCHEDULED" && s.myStatus !== "REGISTERED" && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => handleRegister(s.id)}>
                              {busy ? "…" : t("register")}
                            </Button>
                          )}
                          {isLoggedIn && s.status === "SCHEDULED" && s.myStatus !== "MAYBE" && s.myStatus !== "REGISTERED" && (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleMaybe(s.id)}
                              className="text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40">
                              {t("statusMaybe")}
                            </Button>
                          )}
                          {isLoggedIn && s.status === "SCHEDULED" && s.myStatus !== "CANCELLED" && !withinCutoff && (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleCancelReg(s.id)}>
                              {busy ? "…" : t("cancel")}
                            </Button>
                          )}
                          {isLoggedIn && s.status === "SCHEDULED" && s.myStatus === "REGISTERED" && (
                            s.myBeer ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => handleToggleBeer(s.id)}
                                className="border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                              >
                                {t("bringingBeer")}
                              </Button>
                            ) : s.beerBringerId ? (
                              <span className="text-xs text-muted-foreground">🍺 {s.beerBringerName}</span>
                            ) : (
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleToggleBeer(s.id)}>
                                {t("bringBeer")}
                              </Button>
                            )
                          )}
                          {isOrganizer && s.status === "SCHEDULED" && (
                            <span className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-1 py-0.5">
                              <CancelGameDayDialog
                                sessionId={s.id}
                                onCancelled={() => setActionId(null)}
                              />
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              })()}
            </TableBody>
          </Table>
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border shadow-sm">
          <div className="px-4 py-3 text-white font-bold tracking-wide uppercase text-xs"
            style={{ background: "linear-gradient(90deg, oklch(0.20 0.07 150), oklch(0.35 0.12 150))" }}
          >{t("pastGameDays")}</div>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("date")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("season")}</TableHead>
                <TableHead className="text-right">{t("players")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("status")}</TableHead>
                {isOrganizer && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {past.map((s) => {
                const busy = pending && actionId === s.id
                return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    {isLoggedIn ? (
                      <Link href={`/sessions/${s.id}`} className="hover:underline">
                        <span className="hidden sm:inline">{format(new Date(s.date), "EEE, d MMM yyyy · HH:mm")}</span>
                        <span className="sm:hidden">{format(new Date(s.date), "dd.MM. · HH:mm")}</span>
                      </Link>
                    ) : (
                      <>
                        <span className="hidden sm:inline">{format(new Date(s.date), "EEE, d MMM yyyy · HH:mm")}</span>
                        <span className="sm:hidden">{format(new Date(s.date), "dd.MM. · HH:mm")}</span>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{s.seasonYear}</TableCell>
                  <TableCell className="text-right">{s.registrationCount}{s.maxPlayers ? `/${s.maxPlayers}` : ""}</TableCell>
                  <TableCell className="hidden sm:table-cell"><StatusBadge status={s.status} /></TableCell>
                  {isOrganizer && (
                    <TableCell className="text-right">
                      {s.status === "CANCELLED" && (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleReopen(s.id)}
                          className="text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                        >
                          {busy ? "…" : t("reopenGameDay")}
                        </Button>
                      )}
                      {s.status === "SCHEDULED" && (
                        <span className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-1 py-0.5">
                          <CancelGameDayDialog sessionId={s.id} onCancelled={() => setActionId(null)} />
                        </span>
                      )}
                      {s.status === "IN_PROGRESS" && (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleEndSession(s.id)}
                            className="text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                          >
                            {busy ? "…" : t("endGameDay")}
                          </Button>
                          <span className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-1 py-0.5">
                            <CancelGameDayDialog sessionId={s.id} onCancelled={() => setActionId(null)} />
                          </span>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
          </div>
        </section>
      )}
    </div>
  )
}
