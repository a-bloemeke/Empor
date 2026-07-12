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

// ─── Excel Full-Restore Import Dialog ────────────────────────────────────────

function ExcelImportDialog({ seasons }: { seasons: Season[] }) {
  const t = useTranslations("admin.data")
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [importScope, setImportScope] = useState<string>("all")
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge")
  const [confirmed, setConfirmed] = useState(false)
  const [importing, setImporting] = useState(false)

  function openDialog() {
    setFile(null)
    setConfirmed(false)
    setImportScope("all")
    setImportMode("merge")
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
      const params = new URLSearchParams()
      if (importScope !== "all") params.set("season", importScope)
      params.set("mode", importMode)
      const url = `/api/admin/import-xlsx?${params}`
      const res = await fetch(url, {
        method: "POST",
        body: await file.arrayBuffer(),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Import fehlgeschlagen.")
      toast.success(importMode === "merge"
        ? "Daten erfolgreich hinzugefügt."
        : importScope === "all" ? "Alle Daten wiederhergestellt." : `Saison ${importScope} wiederhergestellt.`
      )
      setOpen(false)
      window.location.reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const isReplace = importMode === "replace"
  const isMerge = importMode === "merge"

  return (
    <>
      <Button variant="outline" className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/5" onClick={openDialog}>
        <UploadIcon className="size-4" /> Excel importieren
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!importing) setOpen(o) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aus Excel importieren</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Mode */}
            <div className="space-y-1.5">
              <Label>Modus</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setImportMode("merge"); setConfirmed(false) }}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${isMerge ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}
                >
                  <div className="text-xs font-semibold">Hinzufügen</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Bestehende Daten bleiben erhalten</div>
                </button>
                <button
                  onClick={() => { setImportMode("replace"); setConfirmed(false) }}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${isReplace ? "border-destructive bg-destructive/10 text-destructive" : "border-border hover:border-primary/40"}`}
                >
                  <div className="text-xs font-semibold">Ersetzen</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Bestehende Daten werden überschrieben</div>
                </button>
              </div>
            </div>
            {/* Scope — only relevant for replace mode */}
            {isReplace && (
              <div className="space-y-1.5">
                <Label>Was ersetzen?</Label>
                <Select value={importScope} onValueChange={(v) => { if (v) { setImportScope(v); setConfirmed(false) } }}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: string) => v === "all" ? "Alles" : `Nur Saison ${v}`}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alles (vollständige Wiederherstellung)</SelectItem>
                    {seasons.map((s) => (
                      <SelectItem key={s.year} value={String(s.year)}>
                        Nur Saison {s.year}{s.status === "ACTIVE" ? " (aktiv)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Warning */}
            <div className={`rounded-lg px-4 py-3 text-sm ${isReplace ? "bg-destructive/10 border border-destructive/30 text-destructive" : "bg-blue-50 border border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300"}`}>
              {isMerge
                ? "ℹ️ Neue Spieler, Saisons, Spieltage und Statistiken werden hinzugefügt. Bereits vorhandene Einträge bleiben unverändert — Statistiken werden aufaddiert."
                : importScope === "all"
                ? "⚠️ Alle bestehenden Daten werden gelöscht und durch den Inhalt der Datei ersetzt."
                : `⚠️ Alle Daten für Saison ${importScope} werden gelöscht und durch den Inhalt der Datei ersetzt.`
              }
            </div>
            {/* File picker */}
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
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4 rounded border" />
              {isMerge ? "Ich verstehe, dass Statistiken aufaddiert werden." : "Ich habe ein Backup und verstehe, dass Daten überschrieben werden."}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>Abbrechen</Button>
            <Button variant={isReplace ? "destructive" : "default"} onClick={handleImport} disabled={importing || !file || !confirmed}>
              {importing ? t("importing") : isMerge ? "Hinzufügen" : "Ersetzen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Export Dialog ────────────────────────────────────────────────────────────

function ExportDialog({ seasons }: { seasons: Season[] }) {
  const t = useTranslations("admin.data")
  const [open, setOpen] = useState(false)
  const [exportYear, setExportYear] = useState<string>("all")
  const [format, setFormat] = useState<"json" | "xlsx">("xlsx")
  const [filename, setFilename] = useState("")
  const [exporting, setExporting] = useState(false)

  function defaultFilename(fmt: "json" | "xlsx", year: string) {
    const scope = year === "all" ? "all-seasons" : `season-${year}`
    const ext = fmt === "json" ? "json" : "xlsx"
    return `empor-export-${scope}.${ext}`
  }

  function openDialog() {
    setExportYear("all")
    setFormat("xlsx")
    setFilename(defaultFilename("xlsx", "all"))
    setOpen(true)
  }

  function handleFormatChange(fmt: "json" | "xlsx") {
    setFormat(fmt)
    setFilename((prev) => {
      const base = prev.replace(/\.(json|xlsx)$/, "")
      return `${base}.${fmt === "json" ? "json" : "xlsx"}`
    })
  }

  function handleYearChange(year: string) {
    setExportYear(year)
    setFilename(defaultFilename(format, year))
  }

  async function handleExport() {
    const base = format === "json" ? "/api/admin/export" : "/api/admin/export-xlsx"
    const url = exportYear === "all" ? base : `${base}?season=${exportYear}`
    const name = (filename.trim() || defaultFilename(format, exportYear))
    setExporting(true)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error("Export fehlgeschlagen.")
      const blob = await res.blob()
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = name
      a.click()
      URL.revokeObjectURL(a.href)
      setOpen(false)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setExporting(false)
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

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={openDialog}>
        <DownloadIcon className="size-4" /> {t("exportTitle")}
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!exporting) setOpen(o) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("exportTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("scope")}</Label>
              <Select value={exportYear} onValueChange={(v) => { if (v) handleYearChange(v) }}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string) => v === "all" ? t("allSeasons") : t("seasonN", { year: v })}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>{exportSeasonOptions}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <div className="flex gap-2">
                {(["xlsx", "json"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => handleFormatChange(fmt)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      format === fmt
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    {fmt === "xlsx" ? "Excel (.xlsx)" : "JSON (.json)"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Dateiname</Label>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={defaultFilename(format, exportYear)}
              />
              <p className="text-xs text-muted-foreground">Der Speicherort wird vom Browser bestimmt.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={exporting}>Abbrechen</Button>
            <Button onClick={handleExport} disabled={exporting} className="gap-2">
              <DownloadIcon className="size-4" />
              {exporting ? "Exportiere…" : "Herunterladen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function DataClient({ seasons }: { seasons: Season[] }) {
  const t = useTranslations("admin.data")
  const [resetYear, setResetYear] = useState<string>(String(new Date().getFullYear()))
  const [resetting, setResetting] = useState(false)

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
          <ExportDialog seasons={seasons} />
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
            <ExcelImportDialog seasons={seasons} />
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
