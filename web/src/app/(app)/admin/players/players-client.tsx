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
import { createGuest, createPlayer, deletePlayer } from "./actions"
import { toast } from "sonner"

type Player = {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
  isGuest: boolean
}

function CreateGuestDialog() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")

  function handleCreate() {
    if (!firstName.trim()) { toast.error("First name is required."); return }
    startTransition(async () => {
      try {
        await createGuest(firstName, lastName)
        toast.success("Guest created.")
        setFirstName(""); setLastName(""); setOpen(false)
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>+ Add guest</DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader><DialogTitle>Add guest player</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Guests have no login. They can be assigned to teams and have goals/assists recorded.
        </p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-fn">First name *</Label>
            <Input id="g-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Thomas" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-ln">Last name</Label>
            <Input id="g-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={pending || !firstName.trim()}>
            {pending ? "Creating…" : "Create guest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreatePlayerDialog() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", password: "" })
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }))

  function handleCreate() {
    startTransition(async () => {
      try {
        await createPlayer(form)
        toast.success("Player created.")
        setForm({ email: "", firstName: "", lastName: "", password: "" }); setOpen(false)
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>+ Add player</DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader><DialogTitle>Add player</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={f("email")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>First name *</Label>
              <Input value={form.firstName} onChange={f("firstName")} />
            </div>
            <div className="space-y-1.5">
              <Label>Last name *</Label>
              <Input value={form.lastName} onChange={f("lastName")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Password *</Label>
            <Input type="password" value={form.password} onChange={f("password")} placeholder="Min. 8 chars" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={pending}>
            {pending ? "Creating…" : "Create player"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PlayersClient({ players }: { players: Player[] }) {
  const [pending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const regular = players.filter((p) => !p.isGuest)
  const guests = players.filter((p) => p.isGuest)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Players</h1>
        <p className="text-muted-foreground text-sm">Manage registered players and guest accounts.</p>
      </div>

      {/* Regular players */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Players ({regular.length})</h2>
          <CreatePlayerDialog />
        </div>
        <SportsTable title="Registered Players">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
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
                      ? <Badge>Organizer</Badge>
                      : <Badge variant="secondary">Player</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      disabled={pending && deletingId === p.id}
                      onClick={() => handleDelete(p.id, `${p.firstName} ${p.lastName}`)}
                    >
                      Delete
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
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Guests ({guests.length})</h2>
          <CreateGuestDialog />
        </div>
        {guests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No guest accounts yet.</p>
        ) : (
          <SportsTable title="Guest Accounts">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.firstName} {p.lastName}</TableCell>
                    <TableCell>
                      <Link href={`/players/${p.id}`} className="text-xs text-primary hover:underline">
                        View stats ↗
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        disabled={pending && deletingId === p.id}
                        onClick={() => handleDelete(p.id, `${p.firstName} ${p.lastName}`)}
                      >
                        Delete
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
