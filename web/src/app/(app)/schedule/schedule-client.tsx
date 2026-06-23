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

type GameSession = {
  id: string
  date: string
  status: string
  seasonYear: number
  registrationCount: number
  myStatus: string | null
}

function statusBadge(status: string) {
  if (status === "SCHEDULED") return <Badge>Scheduled</Badge>
  if (status === "IN_PROGRESS") return <Badge className="bg-primary text-primary-foreground">Live</Badge>
  if (status === "COMPLETED") return <Badge variant="secondary">Completed</Badge>
  return <Badge variant="outline">Cancelled</Badge>
}

function myStatusBadge(status: string | null) {
  if (status === "REGISTERED") return <Badge variant="secondary">Registered</Badge>
  if (status === "CANCELLED") return <span className="text-muted-foreground text-sm">Cancelled</span>
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
  const [open, setOpen] = useState(false)
  const [dateValue, setDateValue] = useState("")
  const [pending, startTransition] = useTransition()
  const [actionId, setActionId] = useState<string | null>(null)

  function handleCreate() {
    if (!dateValue) { toast.error("Pick a date and time."); return }
    startTransition(async () => {
      try {
        await createSession(new Date(dateValue).toISOString())
        toast.success("Game day scheduled.")
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
        toast.success("Game day cancelled.")
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
        toast.success("You are registered.")
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
        toast.success("Registration cancelled.")
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
          <h2 className="font-bold tracking-wide uppercase text-xs">Upcoming Game Days</h2>
          {isOrganizer && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button size="sm" className="bg-white/20 text-white hover:bg-white/30 border-0" />}>New game day</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Schedule a game day</DialogTitle>
                </DialogHeader>
                <div className="space-y-1.5">
                  <Label htmlFor="session-date">Date &amp; time</Label>
                  <Input
                    id="session-date"
                    type="datetime-local"
                    value={dateValue}
                    onChange={(e) => setDateValue(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button onClick={handleCreate} disabled={pending}>
                    {pending ? "Scheduling…" : "Schedule"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming game days.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Season</TableHead>
                <TableHead className="text-right">Players</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>You</TableHead>
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
                        {format(new Date(s.date), "EEE, d MMM yyyy · HH:mm")}
                      </Link>
                    </TableCell>
                    <TableCell>{s.seasonYear}</TableCell>
                    <TableCell className="text-right">{s.registrationCount}</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell>{myStatusBadge(s.myStatus)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {s.status === "SCHEDULED" && !isRegistered && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => handleRegister(s.id)}>
                            {busy ? "…" : "Register"}
                          </Button>
                        )}
                        {s.status === "SCHEDULED" && isRegistered && !withinCutoff && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleCancelReg(s.id)}>
                            {busy ? "…" : "Cancel"}
                          </Button>
                        )}
                        {isOrganizer && s.status === "SCHEDULED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => handleCancelSession(s.id)}
                          >
                            {busy ? "…" : "Cancel game day"}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </section>

      {past.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border shadow-sm">
          <div className="px-4 py-3 text-white font-bold tracking-wide uppercase text-xs"
            style={{ background: "linear-gradient(90deg, oklch(0.20 0.07 150), oklch(0.35 0.12 150))" }}
          >Past Game Days</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Season</TableHead>
                <TableHead className="text-right">Players</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {past.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <Link href={`/sessions/${s.id}`} className="hover:underline">
                      {format(new Date(s.date), "EEE, d MMM yyyy · HH:mm")}
                    </Link>
                  </TableCell>
                  <TableCell>{s.seasonYear}</TableCell>
                  <TableCell className="text-right">{s.registrationCount}</TableCell>
                  <TableCell>{statusBadge(s.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  )
}
