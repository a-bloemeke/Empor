"use client"

import { useState, useTransition } from "react"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createHallClosure, updateHallClosure, deleteHallClosure } from "./actions"
import { toast } from "sonner"

type HallClosure = {
  id: string
  startDate: string
  endDate: string
  reason: string | null
}

type ScheduledSession = {
  id: string
  date: string
}

function toDateInput(iso: string) {
  return new Date(iso).toISOString().slice(0, 10)
}

function conflictsForClosure(closure: HallClosure, sessions: ScheduledSession[]): ScheduledSession[] {
  const start = new Date(closure.startDate).getTime()
  const end = new Date(closure.endDate).getTime()
  return sessions.filter((s) => {
    const d = new Date(s.date).getTime()
    return d >= start && d <= end
  })
}

function ClosureFormDialog({
  closure,
  sessions,
}: {
  closure?: HallClosure
  sessions: ScheduledSession[]
}) {
  const isEdit = !!closure
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState(closure ? toDateInput(closure.startDate) : "")
  const [endDate, setEndDate] = useState(closure ? toDateInput(closure.endDate) : "")
  const [reason, setReason] = useState(closure?.reason ?? "")
  const [pending, startTransition] = useTransition()

  function handleOpen(v: boolean) {
    setOpen(v)
    if (v && !isEdit) {
      setStartDate("")
      setEndDate("")
      setReason("")
    }
  }

  function handleSubmit() {
    if (!startDate || !endDate) { toast.error("Bitte Start- und Enddatum angeben."); return }
    startTransition(async () => {
      try {
        const result = isEdit
          ? await updateHallClosure(closure.id, startDate, endDate, reason || undefined)
          : await createHallClosure(startDate, endDate, reason || undefined)

        if (result.conflictDates.length > 0) {
          const dateList = result.conflictDates
            .map((d) => format(new Date(d), "d. MMM yyyy", { locale: de }))
            .join(", ")
          toast.warning(
            `Sperrung gespeichert – ${result.conflictDates.length} bereits geplanter Spieltag${result.conflictDates.length > 1 ? "e fallen" : " fällt"} in diesen Zeitraum: ${dateList}`,
            { duration: 8000 },
          )
        } else {
          toast.success(isEdit ? "Sperrung aktualisiert." : "Sperrung gespeichert.")
        }
        setOpen(false)
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger render={
        isEdit
          ? <Button variant="ghost" size="sm" className="text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40" />
          : <Button className="bg-amber-500 hover:bg-amber-600 text-white" />
      }>
        {isEdit ? "Bearbeiten" : "+ Sperrung anlegen"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sperrung bearbeiten" : "Neue Hallensperrung"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="closure-start">Startdatum</Label>
              <Input
                id="closure-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closure-end">Enddatum</Label>
              <Input
                id="closure-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="closure-reason">Grund (optional)</Label>
            <Input
              id="closure-reason"
              placeholder="z. B. Schulferien"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {/* Preview: show conflicting sessions for current input */}
          {startDate && endDate && (() => {
            const preview: ScheduledSession[] = sessions.filter((s) => {
              const d = new Date(s.date).getTime()
              const st = new Date(startDate + "T00:00:00.000Z").getTime()
              const en = new Date(endDate + "T00:00:00.000Z").getTime()
              return d >= st && d <= en
            })
            if (preview.length === 0) return null
            return (
              <div className="rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 px-3 py-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400 mb-1">
                  ⚠️ {preview.length} geplanter Spieltag{preview.length > 1 ? "e betroffen" : " betroffen"}
                </p>
                <ul className="space-y-0.5 text-orange-800 dark:text-orange-300">
                  {preview.map((s) => (
                    <li key={s.id}>{format(new Date(s.date), "EEEE, d. MMM yyyy", { locale: de })}</li>
                  ))}
                </ul>
              </div>
            )
          })()}
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Wird gespeichert…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ClosuresClient({
  closures,
  sessions,
}: {
  closures: HallClosure[]
  sessions: ScheduledSession[]
}) {
  const [pending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function handleDelete(id: string) {
    if (!confirm("Sperrung wirklich löschen?")) return
    setDeletingId(id)
    startTransition(async () => {
      try {
        await deleteHallClosure(id)
        toast.success("Sperrung gelöscht.")
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setDeletingId(null)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">Hallensperrungen</h1>
          <p className="text-muted-foreground text-sm">
            Zeiträume verwalten, in denen die Halle nicht verfügbar ist. Spieltage können nicht auf gesperrte Tage gelegt werden.
          </p>
        </div>
        <ClosureFormDialog sessions={sessions} />
      </div>

      <Card>
        <CardContent className="p-0">
          {closures.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">Keine Hallensperrungen eingetragen.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Von</TableHead>
                  <TableHead>Bis</TableHead>
                  <TableHead>Grund</TableHead>
                  <TableHead>Konflikte</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {closures.map((c) => {
                  const conflicts = conflictsForClosure(c, sessions)
                  const hasConflict = conflicts.length > 0
                  return (
                    <TableRow
                      key={c.id}
                      className={hasConflict ? "bg-orange-50 dark:bg-orange-950/20" : ""}
                    >
                      <TableCell className={hasConflict ? "text-orange-800 dark:text-orange-300 font-medium" : ""}>
                        {format(new Date(c.startDate), "d. MMM yyyy", { locale: de })}
                      </TableCell>
                      <TableCell className={hasConflict ? "text-orange-800 dark:text-orange-300 font-medium" : ""}>
                        {format(new Date(c.endDate), "d. MMM yyyy", { locale: de })}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.reason ?? "—"}</TableCell>
                      <TableCell>
                        {hasConflict ? (
                          <span
                            className="text-xs font-semibold text-orange-700 dark:text-orange-400"
                            title={conflicts.map((s) => format(new Date(s.date), "d. MMM yyyy", { locale: de })).join(", ")}
                          >
                            ⚠️ {conflicts.length} Spieltag{conflicts.length > 1 ? "e" : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <ClosureFormDialog closure={c} sessions={sessions} />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={pending && deletingId === c.id}
                            onClick={() => handleDelete(c.id)}
                          >
                            {pending && deletingId === c.id ? "…" : "Löschen"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
