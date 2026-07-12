"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { DownloadIcon, UploadIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"

type Season = { year: number; status: string }

// ─── CSV Import Dialog ────────────────────────────────────────────────────────

function CsvImportDialog({
  seasons,
  type,
  onDone,
}: {
  seasons: Season[]
  type: "scores" | "points"
  onDone?: () => void
}) {
  const t = useTranslations("admin.data")
  const fileRef = useRef<HTMLInputElement>(null)
  const currentYear = String(new Date().getFullYear())
  const defaultYear = seasons.find((s) => s.status === "ACTIVE")?.year
    ? String(seasons.find((s) => s.status === "ACTIVE")!.year)
    : currentYear
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(defaultYear)
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const label = type === "scores" ? "CSV Scores" : "CSV Points"

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    e.target.value = ""
    setFile(f)
  }

  function openDialog() {
    setFile(null)
    setYear(defaultYear)
    setOpen(true)
  }

  async function handleImport() {
    if (!file) { toast.error("Bitte eine Datei auswählen."); return }

    // Filename check: year must appear in the filename
    if (!file.name.includes(year)) {
      const proceed = confirm(
        `Warnung: Der Dateiname „${file.name}" enthält nicht das Jahr ${year}.\n\nTrotzdem für Saison ${year} importieren?`
      )
      if (!proceed) return
    }

    setImporting(true)
    try {
      const base = type === "scores" ? "/api/admin/import-csv" : "/api/admin/import-csv-points"
      const res = await fetch(`${base}?season=${year}`, {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: await file.text(),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Import failed.")
      const imp = (json.imported as string[]).length
      const skip = (json.skipped as string[]).length
      const cre = (json.created as string[] ?? []).length
      toast.success(`${imp} Spieler importiert, ${skip} übersprungen${cre > 0 ? `, ${cre} neu angelegt` : ""}.`)
      if (json.skipped?.length > 0) toast.info(`Übersprungen: ${(json.skipped as string[]).join(", ")}`)
      if (json.created?.length > 0) toast.info(`Neu angelegt: ${(json.created as string[]).join(", ")}`)
      setOpen(false)
      onDone?.()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={openDialog}>
        <UploadIcon className="size-4" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!importing) setOpen(o) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{label} importieren</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Saison (Jahr)</Label>
              <Select value={year} onValueChange={(v) => { if (v) setYear(v) }}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {seasons.map((s) => (
                    <SelectItem key={s.year} value={String(s.year)}>
                      {s.year}{s.status === "ACTIVE" ? " (aktiv)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>CSV-Datei</Label>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  Datei wählen
                </Button>
                {file
                  ? <span className={`text-sm truncate max-w-[200px] ${!file.name.includes(year) ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                      {file.name}
                      {!file.name.includes(year) && " ⚠"}
                    </span>
                  : <span className="text-sm text-muted-foreground">Keine Datei gewählt</span>
                }
              </div>
              {file && !file.name.includes(year) && (
                <p className="text-xs text-amber-600">
                  Dateiname enthält nicht „{year}" — bitte prüfen ob die richtige Saison ausgewählt ist.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>Abbrechen</Button>
            <Button onClick={handleImport} disabled={importing || !file}>
              {importing ? t("importing") : `Importieren für ${year}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Excel Full-Restore Import Dialog ────────────────────────────────────────

function ExcelImportDialog() {
  const t = useTranslations("admin.data")
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [importing, setImporting] = useState(false)

  function openDialog() {
    setFile(null)
    setConfirmed(false)
    setOpen(true)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null)
    e.target.value = ""
  }

  async function handleImport() {
    if (!file || !confirmed) return
    setImporting(true)
    try {
      const res = await fetch("/api/admin/import-xlsx", {
        method: "POST",
        body: await file.arrayBuffer(),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Import fehlgeschlagen.")
      toast.success("Daten erfolgreich wiederhergestellt.")
      setOpen(false)
      window.location.reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <Button variant="outline" className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/5" onClick={openDialog}>
        <UploadIcon className="size-4" /> Excel wiederherstellen
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!importing) setOpen(o) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vollständige Wiederherstellung aus Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
              ⚠️ Diese Aktion ersetzt <strong>alle Daten</strong> in der Datenbank durch den Inhalt der Excel-Datei. Nicht rückgängig zu machen.
            </div>
            <div className="space-y-1.5">
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  Excel-Datei wählen
                </Button>
                {file
                  ? <span className="text-sm text-muted-foreground truncate max-w-[220px]">{file.name}</span>
                  : <span className="text-sm text-muted-foreground">Keine Datei gewählt</span>
                }
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="h-4 w-4 rounded border"
              />
              Ich habe ein Backup und verstehe, dass alle Daten ersetzt werden.
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>Abbrechen</Button>
            <Button variant="destructive" onClick={handleImport} disabled={importing || !file || !confirmed}>
              {importing ? t("importing") : "Jetzt wiederherstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function DataClient({ seasons }: { seasons: Season[] }) {
  const t = useTranslations("admin.data")
  const [exportYear, setExportYear] = useState<string>("all")
  const [resetYear, setResetYear] = useState<string>(String(new Date().getFullYear()))
  const [resetting, setResetting] = useState(false)

  function exportUrl(format: "json" | "xlsx") {
    const base = format === "json" ? "/api/admin/export" : "/api/admin/export-xlsx"
    return exportYear === "all" ? base : `${base}?season=${exportYear}`
  }

  async function handleReset(type: "points" | "scores") {
    const label = type === "points" ? "Punkte & Spieltage" : "Tore & Assists"
    const season = resetYear === "all" ? "alle Saisons" : `Saison ${resetYear}`
    if (!confirm(`${label} für ${season} wirklich zurücksetzen?`)) return
    setResetting(true)
    try {
      const body: Record<string, unknown> = { type }
      if (resetYear !== "all") body.seasonYear = parseInt(resetYear)
      const res = await fetch("/api/admin/reset-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Reset failed.")
      toast.success(`${label} für ${season} zurückgesetzt.`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setResetting(false)
    }
  }

  const exportSeasonOptions = (
    <>
      <SelectItem value="all">{t("allSeasons")}</SelectItem>
      {seasons.map((s) => (
        <SelectItem key={s.year} value={String(s.year)}>
          {s.year}{s.status === "ACTIVE" ? " (aktiv)" : ""}
        </SelectItem>
      ))}
    </>
  )

  const resetSeasonOptions = (
    <>
      <SelectItem value="all">{t("allSeasons")}</SelectItem>
      {seasons.map((s) => (
        <SelectItem key={s.year} value={String(s.year)}>
          {s.year}{s.status === "ACTIVE" ? " (aktiv)" : ""}
        </SelectItem>
      ))}
    </>
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Export */}
        <div className="rounded-xl border p-5 space-y-4">
          <div>
            <h2 className="font-semibold">{t("exportTitle")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("exportDesc")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("scope")}</Label>
            <Select value={exportYear} onValueChange={(v) => { if (v) setExportYear(v) }}>
              <SelectTrigger className="w-48">
                <SelectValue>
                  {(v: string) => v === "all" ? t("allSeasons") : t("seasonN", { year: v })}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>{exportSeasonOptions}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => { window.location.href = exportUrl("json") }}>
              <DownloadIcon className="size-4" /> {t("json")}
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => { window.location.href = exportUrl("xlsx") }}>
              <DownloadIcon className="size-4" /> {t("excel")}
            </Button>
          </div>
        </div>

        {/* Import */}
        <div className="rounded-xl border p-5 space-y-4">
          <div>
            <h2 className="font-semibold">{t("importTitle")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Wähle Jahr und Datei im Dialog. Der Dateiname wird auf das gewählte Jahr geprüft.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CsvImportDialog seasons={seasons} type="scores" />
            <CsvImportDialog seasons={seasons} type="points" />
          </div>
          <div className="border-t pt-4 space-y-2">
            <p className="text-xs text-muted-foreground">Vollständige Wiederherstellung — stellt alle Daten aus einer Excel-Exportdatei wieder her.</p>
            <ExcelImportDialog />
          </div>
        </div>
      </div>

      {/* Reset */}
      <div className="rounded-xl border border-destructive/30 p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-destructive">Statistiken zurücksetzen</h2>
          <p className="text-sm text-muted-foreground mt-1">Punkte/Spieltage oder Tore/Assists für eine Saison auf 0 zurücksetzen, um neu zu importieren.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Saison</Label>
          <Select value={resetYear} onValueChange={(v) => { if (v) setResetYear(v) }}>
            <SelectTrigger className="w-48">
              <SelectValue>
                {(v: string) => v === "all" ? t("allSeasons") : t("seasonN", { year: v })}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>{resetSeasonOptions}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" disabled={resetting} className="gap-2" onClick={() => handleReset("points")}>
            <Trash2Icon className="size-4" /> {resetting ? "Wird zurückgesetzt…" : "Punkte & Spieltage"}
          </Button>
          <Button variant="destructive" disabled={resetting} className="gap-2" onClick={() => handleReset("scores")}>
            <Trash2Icon className="size-4" /> {resetting ? "Wird zurückgesetzt…" : "Tore & Assists"}
          </Button>
        </div>
      </div>
    </div>
  )
}
