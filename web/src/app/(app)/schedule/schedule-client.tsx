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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createSession, cancelSession, registerSelf, cancelSelf } from "./actions"
import { toast } from "sonner"
import Link from "next/link"
import { useTranslations } from "next-intl"

type GameSession = {
  id: string
  date: string
  status: string
  seasonYear: number
  registrationCount: number
  myStatus: string | null
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
  return <span className="text-muted-foreground text-sm">—</span>
}

export function ScheduleClient({
  upcoming,
  past,
  isOrganizer,
  currentUserId,
}: {
  upcoming: GameSession[]
  past: GameSession[]
  isOrganizer: boolean
  currentUserId: string
}) {
  const t = useTranslations("schedule")
  const [open, setOpen] = useState(false)
  const [dateValue, setDateValue] = useState("")
  const [pending, startTransition] = useTransition()
  const [actionId, setActionId] = useState<string | null>(null)

  function handleCreate() {
    if (!dateValue) { toast.error(t("pickDateTime")); return }
    startTransition(async () => {
      try {
        await createSession(new Date(dateValue).toISOString())
        toast.success(t("gameDayScheduled"))
        setOpen(false)
        setDateValue("")
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  function handleCancelSession(id: string) {
    setActionId(id)
    startTransition(async () => {
      try {
        await cancelSession(id)
        toast.success(t("gameDayCancelled"))
      } catch (e) {
        toast.error((e as Error).message)
      } finally { setActionId(null) }
    })
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

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-xl border border-border shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 text-white"
          style={{ background: "linear-gradient(90deg, oklch(0.20 0.07 150), oklch(0.35 0.12 150))" }}
        >
          <h2 className="font-bold tracking-wide uppercase text-xs">{t("upcomingGameDays")}</h2>
          {isOrganizer && (
            <Dialog open={open} onOpenChange={setOpen}>
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
                <DialogFooter>
                  <Button onClick={handleCreate} disabled={pending}>
                    {pending ? t("scheduling") : t("schedule")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {upcoming.length === 0 ? (
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
                <TableHead className="hidden sm:table-cell">{t("you")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {upcoming.map((s) => {
                const withinCutoff = new Date() >= new Date(new Date(s.date).getTime() - 60 * 60 * 1000)
                const isRegistered = s.myStatus === "REGISTERED"
                const busy = pending && actionId === s.id

                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link href={`/sessions/${s.id}`} className="hover:underline">
                        <span className="hidden sm:inline">{format(new Date(s.date), "EEE, d MMM yyyy · HH:mm")}</span>
                        <span className="sm:hidden">{format(new Date(s.date), "dd.MM. · HH:mm")}</span>
                      </Link>
                      <div className="sm:hidden flex items-center gap-1.5 mt-0.5">
                        <StatusBadge status={s.status} />
                        <MyStatusBadge status={s.myStatus} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{s.seasonYear}</TableCell>
                    <TableCell className="text-right">{s.registrationCount}</TableCell>
                    <TableCell className="hidden sm:table-cell"><StatusBadge status={s.status} /></TableCell>
                    <TableCell className="hidden sm:table-cell"><MyStatusBadge status={s.myStatus} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {s.status === "SCHEDULED" && !isRegistered && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => handleRegister(s.id)}>
                            {busy ? "…" : t("register")}
                          </Button>
                        )}
                        {s.status === "SCHEDULED" && isRegistered && !withinCutoff && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleCancelReg(s.id)}>
                            {busy ? "…" : t("cancel")}
                          </Button>
                        )}
                        {isOrganizer && s.status === "SCHEDULED" && (
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => handleCancelSession(s.id)}>
                            {busy ? "…" : t("cancelGameDay")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {past.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <Link href={`/sessions/${s.id}`} className="hover:underline">
                      <span className="hidden sm:inline">{format(new Date(s.date), "EEE, d MMM yyyy · HH:mm")}</span>
                      <span className="sm:hidden">{format(new Date(s.date), "dd.MM. · HH:mm")}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{s.seasonYear}</TableCell>
                  <TableCell className="text-right">{s.registrationCount}</TableCell>
                  <TableCell className="hidden sm:table-cell"><StatusBadge status={s.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </section>
      )}
    </div>
  )
}
