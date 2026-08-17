"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DownloadIcon, XIcon, UserPlusIcon } from "lucide-react"
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { setFeeStatus, addPlayersToYear, removePlayerFromYear } from "./actions"
import { toast } from "sonner"
import Link from "next/link"
import { SportsTable } from "@/components/app/sports-table"
import { useTranslations } from "next-intl"

type PlayerRow = {
  id: string
  name: string
  status: string
  paidAt: string | null
}

type AvailablePlayer = {
  id: string
  name: string
}

export function MembershipClient({
  players,
  availableToAdd,
  year,
  defaultYear,
}: {
  players: PlayerRow[]
  availableToAdd: AvailablePlayer[]
  year: number
  defaultYear: number
}) {
  const t = useTranslations("admin.membership")
  const router = useRouter()

  const [filter, setFilter] = useState<"ALL" | "PAID" | "NOT_PAID">("ALL")
  const [localStatus, setLocalStatus] = useState<Record<string, string>>({})
  const [localPaidAt, setLocalPaidAt] = useState<Record<string, string | null>>({})
  const [removing, setRemoving] = useState<Set<string>>(new Set())

  const [pending, startTransition] = useTransition()
  const [addPending, startAddTransition] = useTransition()
  const [actionId, setActionId] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const yearOptions = Array.from({ length: 5 }, (_, i) => defaultYear - 2 + i)

  function handleYearChange(v: string | null) {
    if (!v) return
    const params = new URLSearchParams(window.location.search)
    params.set("year", v)
    router.push(`?${params.toString()}`)
  }

  function togglePlayer(id: string) {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function toggleAll() {
    setSelected((s) =>
      s.size === availableToAdd.length ? new Set() : new Set(availableToAdd.map((p) => p.id))
    )
  }

  function handleAddPlayers() {
    const ids = [...selected]
    startAddTransition(async () => {
      try {
        await addPlayersToYear(ids, year)
        setAddOpen(false)
        setSelected(new Set())
        toast.success(t("addedCount", { count: ids.length, year }))
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  function handleRemove(p: PlayerRow) {
    setRemoving((s) => new Set([...s, p.id]))
    startTransition(async () => {
      try {
        await removePlayerFromYear(p.id, year)
        toast.success(t("removed", { year }))
      } catch (e) {
        setRemoving((s) => {
          const n = new Set(s)
          n.delete(p.id)
          return n
        })
        toast.error((e as Error).message)
      }
    })
  }

  function getStatus(p: PlayerRow) {
    return localStatus[`${p.id}:${year}`] ?? p.status
  }

  function getPaidAt(p: PlayerRow) {
    const key = `${p.id}:${year}`
    return key in localPaidAt ? localPaidAt[key] : p.paidAt
  }

  function handleToggle(p: PlayerRow) {
    const current = getStatus(p)
    const next = current === "PAID" ? "NOT_PAID" : "PAID"
    const key = `${p.id}:${year}`
    setActionId(key)
    startTransition(async () => {
      try {
        await setFeeStatus(p.id, year, next as "PAID" | "NOT_PAID")
        setLocalStatus((s) => ({ ...s, [key]: next }))
        setLocalPaidAt((s) => ({ ...s, [key]: next === "PAID" ? new Date().toISOString() : null }))
        toast.success(t("markedAs", { name: p.name, status: next === "PAID" ? t("paid") : t("notPaid") }))
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setActionId(null)
      }
    })
  }

  const visiblePlayers = players.filter((p) => !removing.has(p.id))

  const filtered = visiblePlayers.filter((p) => {
    const status = getStatus(p)
    if (filter === "PAID") return status === "PAID"
    if (filter === "NOT_PAID") return status === "NOT_PAID"
    return true
  })

  const paidCount = visiblePlayers.filter((p) => getStatus(p) === "PAID").length

  function handleExport() {
    const rows = visiblePlayers.map((p) => {
      const status = getStatus(p)
      const paidAt = getPaidAt(p)
      return [
        `"${p.name.replace(/"/g, '""')}"`,
        status === "PAID" ? t("paid") : t("notPaid"),
        paidAt ? format(new Date(paidAt), "dd.MM.yyyy") : "",
      ].join(",")
    })
    const csv = [["Name", t("status"), t("datePaid")].join(","), ...rows].join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `mitgliedsbeitraege-${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold mb-1">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("paidCount", { paid: paidCount, total: visiblePlayers.length, year })}
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={String(year)} onValueChange={handleYearChange}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filter} onValueChange={(v) => { if (v) setFilter(v as typeof filter) }}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("filterAll")}</SelectItem>
            <SelectItem value="PAID">{t("filterPaid")}</SelectItem>
            <SelectItem value="NOT_PAID">{t("filterNotPaid")}</SelectItem>
          </SelectContent>
        </Select>

        <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setSelected(new Set()) }}>
          <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5" disabled={availableToAdd.length === 0} />}>
            <UserPlusIcon className="size-3.5" />
            {t("addPlayers")}
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("addPlayers")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
              <label className="flex items-center gap-2 text-sm py-1 cursor-pointer select-none border-b pb-2 mb-1">
                <input
                  type="checkbox"
                  checked={selected.size === availableToAdd.length}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border"
                />
                <span className="font-medium">{t("selectAll", { count: availableToAdd.length })}</span>
              </label>
              {availableToAdd.map((p) => (
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
              <Button onClick={handleAddPlayers} disabled={addPending || selected.size === 0}>
                {addPending ? t("adding") : selected.size > 0 ? t("addPlayersCount", { count: selected.size }) : t("addPlayers")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5" disabled={visiblePlayers.length === 0}>
          <DownloadIcon className="size-3.5" />
          CSV
        </Button>
      </div>

      {visiblePlayers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center space-y-2">
          <p className="text-sm font-medium">{t("noPlayersInYear", { year })}</p>
          <p className="text-sm text-muted-foreground">{t("addPlayersHint")}</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noMatch")}</p>
      ) : (
        <SportsTable title={t("membershipYear", { year })}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("player")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("datePaid")}</TableHead>
                <TableHead />
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const status = getStatus(p)
                const paidAt = getPaidAt(p)
                const busy = pending && actionId === `${p.id}:${year}`
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link href={`/players/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {status === "PAID" ? (
                        <Badge variant="secondary">{t("paid")}</Badge>
                      ) : (
                        <Badge variant="outline">{t("notPaid")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {paidAt ? format(new Date(paidAt), "d MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => handleToggle(p)}
                      >
                        {busy ? "…" : status === "PAID" ? t("markNotPaid") : t("markPaid")}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        title={t("removeFromYear")}
                        onClick={() => handleRemove(p)}
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </SportsTable>
      )}
    </div>
  )
}
