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

function toDateInput(iso: string) {
  return new Date(iso).toISOString().slice(0, 10)
}

function ClosureFormDialog({
  closure,
}: {
  closure?: HallClosure
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
        if (isEdit) {
          await updateHallClosure(closure.id, startDate, endDate, reason || undefined)
          toast.success("Sperrung aktualisiert.")
        } else {
          await createHallClosure(startDate, endDate, reason || undefined)
          toast.success("Sperrung gespeichert.")
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

export function ClosuresClient({ closures }: { closures: HallClosure[] }) {
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
        <ClosureFormDialog />
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
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {closures.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{format(new Date(c.startDate), "d. MMM yyyy", { locale: de })}</TableCell>
                    <TableCell>{format(new Date(c.endDate), "d. MMM yyyy", { locale: de })}</TableCell>
                    <TableCell className="text-muted-foreground">{c.reason ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ClosureFormDialog closure={c} />
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
