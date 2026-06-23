"use client"

import { useState, useTransition } from "react"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { updateProfile, updateProfileAdmin, changePassword } from "./actions"
import { toast } from "sonner"

type PlayerData = {
  id: string
  firstName: string
  lastName: string
  nickname: string | null
  dateOfBirth: string | null
  addressStreet: string | null
  addressCity: string | null
  addressPostalCode: string | null
  email: string
  role: string
}
type SeasonStat = {
  seasonId: string
  year: number
  sessionsPlayed: number
  matchesPlayed: number
  goals: number
  assists: number
  score: number
  points: number
}
type LifetimeStat = {
  sessionsPlayed: number
  matchesPlayed: number
  goals: number
  assists: number
  score: number
  points: number
} | null
type Fee = { year: number; status: string; paidAt: string | null }

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase()
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

function StatsCard({ data }: { data: NonNullable<LifetimeStat> }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <StatRow label="Game days played" value={data.sessionsPlayed} />
        <StatRow label="Matches played" value={data.matchesPlayed} />
        <StatRow label="Goals" value={data.goals} />
        <StatRow label="Assists" value={data.assists} />
        <StatRow label="Score (G+A)" value={data.score} />
        <StatRow label="Points" value={data.points} />
        <StatRow
          label="Pts / game day"
          value={data.sessionsPlayed > 0 ? (data.points / data.sessionsPlayed).toFixed(1) : "—"}
        />
      </CardContent>
    </Card>
  )
}

function EditProfileDialog({
  player,
  canEdit,
  isOrganizer,
}: {
  player: PlayerData
  canEdit: boolean
  isOrganizer: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    firstName: player.firstName,
    lastName: player.lastName,
    nickname: player.nickname ?? "",
    dateOfBirth: player.dateOfBirth ? player.dateOfBirth.slice(0, 10) : "",
    addressStreet: player.addressStreet ?? "",
    addressCity: player.addressCity ?? "",
    addressPostalCode: player.addressPostalCode ?? "",
  })
  const [adminForm, setAdminForm] = useState({
    email: player.email,
    role: player.role,
  })

  if (!canEdit) return null

  function handleSave() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("First and last name are required.")
      return
    }
    startTransition(async () => {
      try {
        await updateProfile(player.id, form)
        if (isOrganizer) await updateProfileAdmin(player.id, adminForm)
        toast.success("Profile updated.")
        setOpen(false)
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Edit Profile</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name *</Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name *</Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nickname">Nickname</Label>
            <Input
              id="nickname"
              value={form.nickname}
              onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dob">Date of birth</Label>
            <Input
              id="dob"
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="street">Street</Label>
            <Input
              id="street"
              value={form.addressStreet}
              onChange={(e) => setForm((f) => ({ ...f, addressStreet: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="postal">Postal code</Label>
              <Input
                id="postal"
                value={form.addressPostalCode}
                onChange={(e) => setForm((f) => ({ ...f, addressPostalCode: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={form.addressCity}
                onChange={(e) => setForm((f) => ({ ...f, addressCity: e.target.value }))}
              />
            </div>
          </div>
          {isOrganizer && (
            <>
              <div className="border-t pt-3 space-y-3">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Organizer fields</p>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={adminForm.email}
                    onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role">Role</Label>
                  <Select value={adminForm.role} onValueChange={(v) => { if (v) setAdminForm((f) => ({ ...f, role: v })) }}>
                    <SelectTrigger id="role" className="w-full">
                      <SelectValue>
                        {(v: string) => v === "ORGANIZER" ? "Organizer" : "Player"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PLAYER">Player</SelectItem>
                      <SelectItem value="ORGANIZER">Organizer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChangePasswordDialog({
  playerId,
  canEdit,
}: {
  playerId: string
  canEdit: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [newPassword, setNewPassword] = useState("")
  const [confirm, setConfirm] = useState("")

  if (!canEdit) return null

  function handleSave() {
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters."); return }
    if (newPassword !== confirm) { toast.error("Passwords do not match."); return }
    startTransition(async () => {
      try {
        await changePassword(playerId, { newPassword })
        toast.success("Password changed.")
        setOpen(false)
        setNewPassword("")
        setConfirm("")
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Change Password</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min. 8 characters"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={pending || !newPassword || !confirm}>
            {pending ? "Saving…" : "Change Password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PlayerClient({
  player,
  seasons,
  seasonStats,
  lifetimeStats,
  fees,
  currentYear,
  isCurrentUser,
  isOrganizer,
  canEdit,
}: {
  player: PlayerData
  seasons: { id: string; year: number }[]
  seasonStats: SeasonStat[]
  lifetimeStats: LifetimeStat
  fees: Fee[]
  currentYear: number
  isCurrentUser: boolean
  isOrganizer: boolean
  canEdit: boolean
}) {
  const [selectedYear, setSelectedYear] = useState(
    String(seasonStats[0]?.year ?? seasons[0]?.year ?? currentYear),
  )

  const selectedStat = seasonStats.find((s) => String(s.year) === selectedYear)
  const displayName = player.nickname
    ? `${player.firstName} ${player.lastName} (${player.nickname})`
    : `${player.firstName} ${player.lastName}`

  const currentFee = fees.find((f) => f.year === currentYear)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-lg font-semibold">
            {initials(player.firstName, player.lastName)}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{displayName}</h1>
            <p className="text-muted-foreground text-sm">{player.email}</p>
            {player.role === "ORGANIZER" && (
              <Badge className="mt-1">Organizer</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <EditProfileDialog player={player} canEdit={canEdit} isOrganizer={isOrganizer} />
          <ChangePasswordDialog playerId={player.id} canEdit={canEdit} />
        </div>
      </div>

      {/* Personal details (visible to own user or organizer) */}
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {player.dateOfBirth && (
              <StatRow label="Date of birth" value={format(new Date(player.dateOfBirth), "d MMMM yyyy")} />
            )}
            {(player.addressStreet || player.addressCity || player.addressPostalCode) && (
              <StatRow
                label="Address"
                value={[player.addressStreet, player.addressPostalCode, player.addressCity]
                  .filter(Boolean)
                  .join(", ")}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Statistics</h2>
        <Tabs defaultValue="lifetime">
          <TabsList className="mb-4">
            <TabsTrigger value="lifetime">Lifetime</TabsTrigger>
            <TabsTrigger value="season">By Season</TabsTrigger>
          </TabsList>
          <TabsContent value="lifetime">
            {lifetimeStats ? (
              <StatsCard data={lifetimeStats} />
            ) : (
              <p className="text-sm text-muted-foreground">No stats recorded yet.</p>
            )}
          </TabsContent>
          <TabsContent value="season" className="space-y-4">
            {seasons.length > 0 ? (
              <>
                <Select value={selectedYear} onValueChange={(v) => { if (v) setSelectedYear(v) }}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {seasons.map((s) => (
                      <SelectItem key={s.id} value={String(s.year)}>{s.year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedStat ? (
                  <StatsCard data={selectedStat} />
                ) : (
                  <p className="text-sm text-muted-foreground">No stats for {selectedYear}.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No seasons yet.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Membership fee */}
      {(isCurrentUser || isOrganizer) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Membership Fee {currentYear}</CardTitle>
          </CardHeader>
          <CardContent>
            {currentFee ? (
              currentFee.status === "PAID" ? (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Paid</Badge>
                  {currentFee.paidAt && (
                    <span className="text-sm text-muted-foreground">
                      on {format(new Date(currentFee.paidAt), "d MMM yyyy")}
                    </span>
                  )}
                </div>
              ) : (
                <Badge variant="outline">Not paid</Badge>
              )
            ) : (
              <Badge variant="outline">Not paid</Badge>
            )}
            {fees.length > 1 && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">History</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Year</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fees.map((f) => (
                      <TableRow key={f.year}>
                        <TableCell>{f.year}</TableCell>
                        <TableCell>
                          {f.status === "PAID" ? (
                            <Badge variant="secondary">Paid</Badge>
                          ) : (
                            <Badge variant="outline">Not paid</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {f.paidAt ? format(new Date(f.paidAt), "d MMM yyyy") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
