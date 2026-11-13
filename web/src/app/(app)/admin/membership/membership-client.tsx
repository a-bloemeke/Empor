"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DownloadIcon, XIcon, UserPlusIcon, SendIcon } from "lucide-react"
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
import { setFeeStatus, addPlayersToYear, removePlayerFromYear, createCampaign, closeCampaign, sendMembershipInvitation } from "./actions"
import { toast } from "sonner"
import Link from "next/link"
import { SportsTable } from "@/components/app/sports-table"
import { useTranslations } from "next-intl"

type PlayerRow = {
  id: string
  name: string
  status: string
  paidAt: string | null
  playerIntent: string | null
  intentAt: string | null
}

type AvailablePlayer = {
  id: string
  name: string
}

type Campaign = {
  year: number
  amount: number
  bankName: string | null
  iban: string | null
  bic: string | null
  paypalHandle: string | null
  status: string
  lastInvitationSentAt: string | null
}

function formatIban(iban: string): string {
  return iban.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim()
}

function IntentBadge({ intent }: { intent: string | null }) {
  if (!intent) return <span className="text-muted-foreground text-sm">—</span>
  if (intent === "CONFIRMED") return <Badge className="bg-green-600 text-white text-xs">✅ Überweist</Badge>
  return <Badge variant="outline" className="border-red-400 text-red-600 text-xs">❌ Kein Interesse</Badge>
}

function CampaignPanel({ year, campaign, playerCount }: { year: number; campaign: Campaign | null; playerCount: number }) {
  const [pending, startTransition] = useTransition()
  const [formOpen, setFormOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [bankName, setBankName] = useState("")
  const [iban, setIban] = useState("")
  const [bic, setBic] = useState("")
  const [paypalHandle, setPaypalHandle] = useState("")

  function handleCreate() {
    const amountNum = parseFloat(amount.replace(",", "."))
    if (!amount || isNaN(amountNum) || amountNum <= 0) { toast.error("Bitte gib einen gültigen Betrag ein."); return }
    startTransition(async () => {
      const res = await createCampaign({ year, amount: amountNum, bankName: bankName || undefined, iban: iban || undefined, bic: bic || undefined, paypalHandle: paypalHandle || undefined })
      if ("error" in res) { toast.error(res.error); return }
      toast.success(`Kampagne ${year} erstellt.`)
      setFormOpen(false)
    })
  }

  function handleClose() {
    if (!window.confirm(`Kampagne ${year} wirklich schließen? Erinnerungen werden nicht mehr versendet.`)) return
    startTransition(async () => {
      const res = await closeCampaign(year)
      if ("error" in res) { toast.error(res.error); return }
      toast.success(`Kampagne ${year} geschlossen.`)
    })
  }

  function handleSendInvitation() {
    if (!window.confirm(`Einladung an alle aktiven Spieler (ca. ${playerCount}) senden?`)) return
    startTransition(async () => {
      const res = await sendMembershipInvitation(year)
      if ("error" in res) { toast.error(res.error); return }
      toast.success(`${res.sent} Einladungen versendet.`)
    })
  }

  if (!campaign) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Beitragskampagne {year}</h2>
            <p className="text-sm text-amber-600 dark:text-amber-500 mt-0.5">Keine Kampagne für {year} vorhanden.</p>
          </div>
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => setFormOpen(!formOpen)}
          >
            Kampagne erstellen
          </Button>
        </div>

        {formOpen && (
          <div className="border-t border-amber-200 dark:border-amber-800 pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Betrag (€) *</Label>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="80" type="number" min="0" step="0.01" />
              </div>
              <div className="space-y-1.5">
                <Label>Bank (optional)</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Sparkasse Berlin" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>IBAN (optional)</Label>
                <Input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="DE89 3704 0044..." />
              </div>
              <div className="space-y-1.5">
                <Label>BIC (optional)</Label>
                <Input value={bic} onChange={(e) => setBic(e.target.value)} placeholder="COBADEFFXXX" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>PayPal-Handle (optional)</Label>
              <Input value={paypalHandle} onChange={(e) => setPaypalHandle(e.target.value)} placeholder="@empor-lichtenberg" />
            </div>
            <Button onClick={handleCreate} disabled={pending} size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
              {pending ? "Wird erstellt…" : "Kampagne erstellen"}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`rounded-xl border p-5 ${campaign.status === "ACTIVE" ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700" : "border-muted bg-muted/30"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Beitragskampagne {campaign.year}</h2>
            {campaign.status === "ACTIVE" ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 font-medium">Aktiv</span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Geschlossen</span>
            )}
          </div>
          <p className="text-2xl font-bold mt-1">{campaign.amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</p>
          <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
            {campaign.bankName && <p>Bank: {campaign.bankName}</p>}
            {campaign.iban && <p>IBAN: {formatIban(campaign.iban)}</p>}
            {campaign.bic && <p>BIC: {campaign.bic}</p>}
            {campaign.paypalHandle && <p>PayPal: {campaign.paypalHandle}</p>}
            {campaign.lastInvitationSentAt && (
              <p className="text-xs mt-1">Letzte Einladung: {format(new Date(campaign.lastInvitationSentAt), "d. MMMM yyyy, HH:mm", { locale: de })} Uhr</p>
            )}
          </div>
        </div>
        {campaign.status === "ACTIVE" && (
          <div className="flex flex-col gap-2 shrink-0">
            <Button
              size="sm"
              onClick={handleSendInvitation}
              disabled={pending}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              <SendIcon className="size-3.5" />
              Einladungen senden
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleClose}
              disabled={pending}
              className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950/40"
            >
              Kampagne schließen
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function MembershipClient({
  players,
  availableToAdd,
  year,
  defaultYear,
  campaign,
}: {
  players: PlayerRow[]
  availableToAdd: AvailablePlayer[]
  year: number
  defaultYear: number
  campaign: Campaign | null
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
  const confirmedCount = visiblePlayers.filter((p) => p.playerIntent === "CONFIRMED").length
  const declinedCount = visiblePlayers.filter((p) => p.playerIntent === "DECLINED").length

  function handleExport() {
    const rows = visiblePlayers.map((p) => {
      const status = getStatus(p)
      const paidAt = getPaidAt(p)
      return [
        `"${p.name.replace(/"/g, '""')}"`,
        status === "PAID" ? t("paid") : t("notPaid"),
        paidAt ? format(new Date(paidAt), "dd.MM.yyyy") : "",
        p.playerIntent === "CONFIRMED" ? "Überweist" : p.playerIntent === "DECLINED" ? "Kein Interesse" : "Keine Antwort",
      ].join(",")
    })
    const csv = [["Name", t("status"), t("datePaid"), "Absicht"].join(","), ...rows].join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `mitgliedsbeitraege-${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("paidCount", { paid: paidCount, total: visiblePlayers.length, year })}
          {confirmedCount > 0 && <span className="ml-2 text-green-600 dark:text-green-400">· {confirmedCount} zugesagt</span>}
          {declinedCount > 0 && <span className="ml-2 text-red-500">· {declinedCount} kein Interesse</span>}
        </p>
      </div>

      <CampaignPanel year={year} campaign={campaign} playerCount={visiblePlayers.length} />

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
                <TableHead>Absicht</TableHead>
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
                      <div>
                        <IntentBadge intent={p.playerIntent} />
                        {p.intentAt && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(p.intentAt), "d. MMM", { locale: de })}
                          </p>
                        )}
                      </div>
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
