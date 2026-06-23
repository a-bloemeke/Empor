"use client"

import { useState, useTransition } from "react"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { setFeeStatus } from "./actions"
import { toast } from "sonner"
import Link from "next/link"
import { SportsTable } from "@/components/app/sports-table"

type PlayerRow = {
  id: string
  name: string
  status: string
  paidAt: string | null
}

export function MembershipClient({
  players,
  defaultYear,
}: {
  players: PlayerRow[]
  defaultYear: number
}) {
  const [year, setYear] = useState(defaultYear)
  const [filter, setFilter] = useState<"ALL" | "PAID" | "NOT_PAID">("ALL")
  const [localStatus, setLocalStatus] = useState<Record<string, string>>({})
  const [localPaidAt, setLocalPaidAt] = useState<Record<string, string | null>>({})
  const [pending, startTransition] = useTransition()
  const [actionId, setActionId] = useState<string | null>(null)

  const yearOptions = Array.from({ length: 5 }, (_, i) => defaultYear - 2 + i)

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
        toast.success(`${p.name} marked as ${next === "PAID" ? "paid" : "not paid"}.`)
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setActionId(null)
      }
    })
  }

  const filtered = players.filter((p) => {
    const status = getStatus(p)
    if (filter === "PAID") return status === "PAID"
    if (filter === "NOT_PAID") return status === "NOT_PAID"
    return true
  })

  const paidCount = players.filter((p) => getStatus(p) === "PAID").length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold mb-1">Membership Fees</h1>
        <p className="text-muted-foreground">
          {paidCount} of {players.length} players paid for {year}.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={String(year)} onValueChange={(v) => { if (v) setYear(parseInt(v)) }}>
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
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="NOT_PAID">Not paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No players match the filter.</p>
      ) : (
        <SportsTable title={`Membership ${year}`}>
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date paid</TableHead>
              <TableHead />
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
                      <Badge variant="secondary">Paid</Badge>
                    ) : (
                      <Badge variant="outline">Not paid</Badge>
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
                      {busy ? "…" : status === "PAID" ? "Mark not paid" : "Mark paid"}
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
