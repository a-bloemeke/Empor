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
import { useTranslations } from "next-intl"

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
  const t = useTranslations("player")
  return (
    <Card>
      <CardContent className="pt-4">
        <StatRow label={t("gameDaysPlayed")} value={data.sessionsPlayed} />
        <StatRow label={t("matchesPlayed")} value={data.matchesPlayed} />
        <StatRow label={t("goals")} value={data.goals} />
        <StatRow label={t("assists")} value={data.assists} />
        <StatRow label={t("scoreGA")} value={data.score} />
        <StatRow label={t("points")} value={data.points} />
        <StatRow
          label={t("ptsPerGameDay")}
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
  const t = useTranslations("player")
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
      toast.error(t("nameRequired"))
      return
    }
    startTransition(async () => {
      try {
        await updateProfile(player.id, form)
        if (isOrganizer) await updateProfileAdmin(player.id, adminForm)
        toast.success(t("profileUpdated"))
        setOpen(false)
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>{t("editProfile")}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editProfile")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">{t("firstName")}</Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">{t("lastName")}</Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nickname">{t("nickname")}</Label>
            <Input
              id="nickname"
              value={form.nickname}
              onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dob">{t("dateOfBirth")}</Label>
            <Input
              id="dob"
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="street">{t("street")}</Label>
            <Input
              id="street"
              value={form.addressStreet}
              onChange={(e) => setForm((f) => ({ ...f, addressStreet: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="postal">{t("postalCode")}</Label>
              <Input
                id="postal"
                value={form.addressPostalCode}
                onChange={(e) => setForm((f) => ({ ...f, addressPostalCode: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">{t("city")}</Label>
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
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("organizerFields")}</p>
                <div className="space-y-1.5">
                  <Label htmlFor="email">{t("email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={adminForm.email}
                    onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role">{t("role")}</Label>
                  <Select value={adminForm.role} onValueChange={(v) => { if (v) setAdminForm((f) => ({ ...f, role: v })) }}>
                    <SelectTrigger id="role" className="w-full">
                      <SelectValue>
                        {(v: string) => v === "ORGANIZER" ? t("organizer") : t("player")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PLAYER">{t("player")}</SelectItem>
                      <SelectItem value="ORGANIZER">{t("organizer")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? t("saving") : t("save")}
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
  const t = useTranslations("player")
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [newPassword, setNewPassword] = useState("")
  const [confirm, setConfirm] = useState("")

  if (!canEdit) return null

  function handleSave() {
    if (newPassword.length < 8) { toast.error(t("passwordTooShort")); return }
    if (newPassword !== confirm) { toast.error(t("passwordMismatch")); return }
    startTransition(async () => {
      try {
        await changePassword(playerId, { newPassword })
        toast.success(t("passwordChanged"))
        setOpen(false)
        setNewPassword("")
        setConfirm("")
      } catch (e) { toast.error((e as Error).message) }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>{t("changePassword")}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("changePassword")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">{t("newPassword")}</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("passwordHint")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">{t("confirmPassword")}</Label>
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
            {pending ? t("saving") : t("changePassword")}
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
  const t = useTranslations("player")
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
              <Badge className="mt-1">{t("organizerBadge")}</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <EditProfileDialog player={player} canEdit={canEdit} isOrganizer={isOrganizer} />
          <ChangePasswordDialog playerId={player.id} canEdit={canEdit} />
        </div>
      </div>

      {/* Personal details */}
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("personalDetails")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {player.dateOfBirth && (
              <StatRow label={t("dateOfBirth")} value={format(new Date(player.dateOfBirth), "d MMMM yyyy")} />
            )}
            {(player.addressStreet || player.addressCity || player.addressPostalCode) && (
              <StatRow
                label={t("address")}
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
        <h2 className="text-lg font-semibold mb-3">{t("statistics")}</h2>
        <Tabs defaultValue="lifetime">
          <TabsList className="mb-4">
            <TabsTrigger value="lifetime">{t("lifetimeStats")}</TabsTrigger>
            <TabsTrigger value="season">{t("bySeason")}</TabsTrigger>
          </TabsList>
          <TabsContent value="lifetime">
            {lifetimeStats ? (
              <StatsCard data={lifetimeStats} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("noStats")}</p>
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
                  <p className="text-sm text-muted-foreground">{t("noStatsForYear", { year: selectedYear })}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noSeasons")}</p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Membership fee */}
      {(isCurrentUser || isOrganizer) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("membershipFee", { year: currentYear })}</CardTitle>
          </CardHeader>
          <CardContent>
            {currentFee ? (
              currentFee.status === "PAID" ? (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{t("paid")}</Badge>
                  {currentFee.paidAt && (
                    <span className="text-sm text-muted-foreground">
                      on {format(new Date(currentFee.paidAt), "d MMM yyyy")}
                    </span>
                  )}
                </div>
              ) : (
                <Badge variant="outline">{t("notPaid")}</Badge>
              )
            ) : (
              <Badge variant="outline">{t("notPaid")}</Badge>
            )}
            {fees.length > 1 && (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">{t("history")}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("year")}</TableHead>
                      <TableHead>{t("status")}</TableHead>
                      <TableHead>{t("datePaid")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fees.map((f) => (
                      <TableRow key={f.year}>
                        <TableCell>{f.year}</TableCell>
                        <TableCell>
                          {f.status === "PAID" ? (
                            <Badge variant="secondary">{t("paid")}</Badge>
                          ) : (
                            <Badge variant="outline">{t("notPaid")}</Badge>
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
