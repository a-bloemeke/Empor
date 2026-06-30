"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { SportsTable } from "@/components/app/sports-table"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { createGuest, createPlayer, deletePlayer, setEmailNotifications } from "./actions"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

type Player = {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
  isGuest: boolean
  emailNotifications: boolean
}

function CreateGuestDialog() {
  const t = useTranslations("admin.players")
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")

  function handleCreate() {
    if (!firstName.trim()) { toast.error(t("firstNameRequired")); return }
    startTransition(async () => {
      try {
        await createGuest(firstName, lastName)
        toast.success(t("guestCreated"))
        setFirstName(""); setLastName(""); setOpen(false)
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>{t("addGuest")}</DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader><DialogTitle>{t("addGuestTitle")}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">{t("addGuestDesc")}</p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-fn">{t("firstName")}</Label>
            <Input id="g-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t("firstNamePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-ln">{t("lastName")}</Label>
            <Input id="g-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t("lastNameOptional")} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={pending || !firstName.trim()}>
            {pending ? t("creating") : t("createGuest")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreatePlayerDialog() {
  const t = useTranslations("admin.players")
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", password: "" })
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }))

  function handleCreate() {
    startTransition(async () => {
      try {
        await createPlayer(form)
        toast.success(t("playerCreated"))
        setForm({ email: "", firstName: "", lastName: "", password: "" }); setOpen(false)
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>{t("addPlayer")}</DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader><DialogTitle>{t("addPlayerTitle")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("emailRequired")}</Label>
            <Input type="email" value={form.email} onChange={f("email")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>{t("firstNameRequired2")}</Label>
              <Input value={form.firstName} onChange={f("firstName")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("lastNameRequired")}</Label>
              <Input value={form.lastName} onChange={f("lastName")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("passwordRequired")}</Label>
            <Input type="password" value={form.password} onChange={f("password")} placeholder={t("passwordHint")} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={pending}>
            {pending ? t("creating") : t("createPlayer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PlayersClient({ players }: { players: Player[] }) {
  const t = useTranslations("admin.players")
  const [pending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return
    setDeletingId(id)
    startTransition(async () => {
      try {
        await deletePlayer(id)
        toast.success(`${name} deleted.`)
      } catch (e) { toast.error((e as Error).message) }
      finally { setDeletingId(null) }
    })
  }

  function handleToggleEmail(id: string, current: boolean) {
    setTogglingId(id)
    startTransition(async () => {
      try {
        await setEmailNotifications(id, !current)
        toast.success(!current ? "E-Mail-Benachrichtigungen aktiviert." : "E-Mail-Benachrichtigungen deaktiviert.")
      } catch (e) { toast.error((e as Error).message) }
      finally { setTogglingId(null) }
    })
  }

  const regular = players.filter((p) => !p.isGuest)
  const guests = players.filter((p) => p.isGuest)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      {/* Regular players */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("registeredPlayers", { count: regular.length })}</h2>
          <CreatePlayerDialog />
        </div>
        <SportsTable title={t("registeredPlayersTitle")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("email")}</TableHead>
                <TableHead>{t("role")}</TableHead>
                <TableHead className="text-center">✉ E-Mails</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {regular.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link href={`/players/${p.id}`} className="hover:underline">
                      {p.firstName} {p.lastName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.email}</TableCell>
                  <TableCell>
                    {p.role === "ORGANIZER"
                      ? <Badge>{t("organizer")}</Badge>
                      : <Badge variant="secondary">{t("player")}</Badge>}
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      title={p.emailNotifications ? "E-Mails deaktivieren" : "E-Mails aktivieren"}
                      disabled={pending && togglingId === p.id}
                      onClick={() => handleToggleEmail(p.id, p.emailNotifications)}
                      className="text-base leading-none transition-opacity hover:opacity-70 disabled:opacity-40"
                    >
                      {p.emailNotifications ? "🔔" : "🔕"}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      disabled={pending && deletingId === p.id}
                      onClick={() => handleDelete(p.id, `${p.firstName} ${p.lastName}`)}
                    >
                      {t("delete")}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SportsTable>
      </div>

      {/* Guest accounts */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("guests", { count: guests.length })}</h2>
          <CreateGuestDialog />
        </div>
        {guests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noGuests")}</p>
        ) : (
          <SportsTable title={t("guestAccounts")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("profile")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.firstName} {p.lastName}</TableCell>
                    <TableCell>
                      <Link href={`/players/${p.id}`} className="text-xs text-primary hover:underline">
                        {t("viewStats")}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        disabled={pending && deletingId === p.id}
                        onClick={() => handleDelete(p.id, `${p.firstName} ${p.lastName}`)}
                      >
                        {t("delete")}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SportsTable>
        )}
      </div>
    </div>
  )
}
