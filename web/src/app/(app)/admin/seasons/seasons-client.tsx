"use client"

import { useState, useTransition } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { startSeason, closeSeason, reopenSeason } from "./actions"
import { toast } from "sonner"
import { SportsTable } from "@/components/app/sports-table"
import { useTranslations } from "next-intl"

type Season = {
  id: string
  year: number
  status: "ACTIVE" | "COMPLETED"
  sessionCount: number
}

export function SeasonsClient({ seasons }: { seasons: Season[] }) {
  const t = useTranslations("admin.seasons")
  const [pending, startTransition] = useTransition()
  const [actionId, setActionId] = useState<string | null>(null)
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()))

  const existingYears = new Set(seasons.map((s) => s.year))

  function handleStart() {
    const year = parseInt(newYear, 10)
    if (isNaN(year)) { toast.error(t("invalidYear")); return }
    if (existingYears.has(year)) { toast.error(t("alreadyExists", { year })); return }
    startTransition(async () => {
      try {
        await startSeason(year)
        toast.success(t("created", { year }))
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  function handleClose(s: Season) {
    setActionId(s.id)
    startTransition(async () => {
      try {
        await closeSeason(s.id)
        toast.success(t("closed", { year: s.year }))
      } catch (e) {
        toast.error((e as Error).message)
      } finally { setActionId(null) }
    })
  }

  function handleReopen(s: Season) {
    setActionId(s.id)
    startTransition(async () => {
      try {
        await reopenSeason(s.id)
        toast.success(t("reopened", { year: s.year }))
      } catch (e) {
        toast.error((e as Error).message)
      } finally { setActionId(null) }
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("createSeason")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-year">{t("year")}</Label>
              <Input
                id="new-year"
                type="number"
                min={2000}
                max={2100}
                className="w-32"
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
              />
            </div>
            <Button
              onClick={handleStart}
              disabled={pending || existingYears.has(parseInt(newYear, 10))}
              size="sm"
            >
              {t("create")}
            </Button>
          </div>
          {existingYears.has(parseInt(newYear, 10)) && (
            <p className="mt-2 text-xs text-muted-foreground">{t("alreadyExistsForm", { year: newYear })}</p>
          )}
        </CardContent>
      </Card>

      {seasons.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noSeasons")}</p>
      ) : (
        <SportsTable title={t("title")}>
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("year")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="text-right">{t("gameDays")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {seasons.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.year}</TableCell>
                <TableCell>
                  {s.status === "ACTIVE" ? (
                    <Badge>{t("active")}</Badge>
                  ) : (
                    <Badge variant="secondary">{t("closedStatus")}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">{s.sessionCount}</TableCell>
                <TableCell className="text-right">
                  {s.status === "ACTIVE" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending && actionId === s.id}
                      onClick={() => handleClose(s)}
                    >
                      {pending && actionId === s.id ? t("closing") : t("close")}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending && actionId === s.id}
                      onClick={() => handleReopen(s)}
                    >
                      {pending && actionId === s.id ? t("reopening") : t("reopen")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </SportsTable>
      )}
    </div>
  )
}
