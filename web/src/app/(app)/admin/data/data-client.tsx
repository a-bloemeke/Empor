"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { DownloadIcon, UploadIcon } from "lucide-react"
import { useTranslations } from "next-intl"

type Season = { year: number; status: string }

export function DataClient({ seasons }: { seasons: Season[] }) {
  const t = useTranslations("admin.data")
  const jsonFileRef = useRef<HTMLInputElement>(null)
  const xlsxFileRef = useRef<HTMLInputElement>(null)
  const csvFileRef = useRef<HTMLInputElement>(null)
  const [exportYear, setExportYear] = useState<string>("all")
  const [importYear, setImportYear] = useState<string>("all")
  const [importing, setImporting] = useState(false)

  function exportUrl(format: "json" | "xlsx") {
    const base = format === "json" ? "/api/admin/export" : "/api/admin/export-xlsx"
    return exportYear === "all" ? base : `${base}?season=${exportYear}`
  }

  function importUrl(format: "json" | "xlsx" | "csv") {
    const base = format === "json" ? "/api/admin/import" : format === "xlsx" ? "/api/admin/import-xlsx" : "/api/admin/import-csv"
    const year = importYear === "all" ? String(new Date().getFullYear()) : importYear
    return `${base}?season=${year}`
  }

  async function handleImport(file: File, fmt: "json" | "xlsx" | "csv") {
    if (fmt !== "csv") {
      const scopeLabel = importYear === "all" ? t("allSeasons") : t("seasonN", { year: importYear })
      if (!window.confirm(t("confirmImport", { scope: scopeLabel }))) return
    }

    setImporting(true)
    try {
      let body: BodyInit
      let contentType: string
      if (fmt === "json") {
        body = await file.text()
        contentType = "application/json"
      } else if (fmt === "xlsx") {
        body = await file.arrayBuffer()
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      } else {
        body = await file.text()
        contentType = "text/csv"
      }
      const res = await fetch(importUrl(fmt), {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Import failed.")
      if (fmt === "csv") {
        const imp = (json.imported as string[]).length
        const skip = (json.skipped as string[]).length
        toast.success(`${imp} Spieler importiert, ${skip} übersprungen.`)
        if (json.skipped?.length > 0) {
          toast.info(`Übersprungen: ${(json.skipped as string[]).join(", ")}`)
        }
      } else {
        toast.success(t("importSuccess"))
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const seasonOptions = (
    <>
      <SelectItem value="all">{t("allSeasons")}</SelectItem>
      {seasons.map((s) => (
        <SelectItem key={s.year} value={String(s.year)}>
          {s.year}{s.status === "ACTIVE" ? " (active)" : ""}
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
              <SelectContent>{seasonOptions}</SelectContent>
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
            <p className="text-sm text-muted-foreground mt-1">{t("importDesc")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("scope")}</Label>
            <Select value={importYear} onValueChange={(v) => { if (v) setImportYear(v) }}>
              <SelectTrigger className="w-48">
                <SelectValue>
                  {(v: string) => v === "all" ? t("allSeasons") : t("seasonN", { year: v })}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>{seasonOptions}</SelectContent>
            </Select>
          </div>
          <input
            ref={jsonFileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleImport(f, "json") }}
          />
          <input
            ref={xlsxFileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleImport(f, "xlsx") }}
          />
          <input
            ref={csvFileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleImport(f, "csv") }}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={importing} className="gap-2" onClick={() => jsonFileRef.current?.click()}>
              <UploadIcon className="size-4" /> {importing ? t("importing") : t("json")}
            </Button>
            <Button variant="outline" disabled={importing} className="gap-2" onClick={() => xlsxFileRef.current?.click()}>
              <UploadIcon className="size-4" /> {importing ? t("importing") : t("excel")}
            </Button>
            <Button variant="outline" disabled={importing} className="gap-2" onClick={() => csvFileRef.current?.click()}>
              <UploadIcon className="size-4" /> {importing ? t("importing") : "CSV Stats"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
