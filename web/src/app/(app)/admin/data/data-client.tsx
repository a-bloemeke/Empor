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

type Season = { year: number; status: string }

export function DataClient({ seasons }: { seasons: Season[] }) {
  const jsonFileRef = useRef<HTMLInputElement>(null)
  const xlsxFileRef = useRef<HTMLInputElement>(null)
  const [exportYear, setExportYear] = useState<string>("all")
  const [importYear, setImportYear] = useState<string>("all")
  const [importing, setImporting] = useState(false)

  function exportUrl(format: "json" | "xlsx") {
    const base = format === "json" ? "/api/admin/export" : "/api/admin/export-xlsx"
    return exportYear === "all" ? base : `${base}?season=${exportYear}`
  }

  function importUrl(format: "json" | "xlsx") {
    const base = format === "json" ? "/api/admin/import" : "/api/admin/import-xlsx"
    return importYear === "all" ? base : `${base}?season=${importYear}`
  }

  async function handleImport(file: File, format: "json" | "xlsx") {
    const scopeLabel = importYear === "all" ? "ALL data" : `season ${importYear}`
    if (!window.confirm(
      `This will replace ${scopeLabel} with the contents of the selected file. Auth accounts are preserved. Continue?`
    )) return

    setImporting(true)
    try {
      let body: BodyInit
      let contentType: string
      if (format === "json") {
        body = await file.text()
        contentType = "application/json"
      } else {
        body = await file.arrayBuffer()
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }
      const res = await fetch(importUrl(format), {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Import failed.")
      toast.success("Data imported successfully.")
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const seasonOptions = (
    <>
      <SelectItem value="all">All seasons</SelectItem>
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
        <h1 className="text-2xl font-bold mb-1">Data</h1>
        <p className="text-muted-foreground">Export or restore app data.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Export */}
        <div className="rounded-xl border p-5 space-y-4">
          <div>
            <h2 className="font-semibold">Export</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Download a snapshot of players, sessions, matches, goals, stats, and fees. Passwords are not included.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Scope</Label>
            <Select value={exportYear} onValueChange={(v) => { if (v) setExportYear(v) }}>
              <SelectTrigger className="w-48">
                <SelectValue>
                  {(v: string) => v === "all" ? "All seasons" : `Season ${v}`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>{seasonOptions}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => { window.location.href = exportUrl("json") }}>
              <DownloadIcon className="size-4" /> JSON
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => { window.location.href = exportUrl("xlsx") }}>
              <DownloadIcon className="size-4" /> Excel
            </Button>
          </div>
        </div>

        {/* Import */}
        <div className="rounded-xl border p-5 space-y-4">
          <div>
            <h2 className="font-semibold">Import</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Restore from a previously exported file. Select a season to import only that season's data from the file, or "All seasons" to restore everything.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Scope</Label>
            <Select value={importYear} onValueChange={(v) => { if (v) setImportYear(v) }}>
              <SelectTrigger className="w-48">
                <SelectValue>
                  {(v: string) => v === "all" ? "All seasons" : `Season ${v}`}
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={importing} className="gap-2" onClick={() => jsonFileRef.current?.click()}>
              <UploadIcon className="size-4" /> {importing ? "Importing…" : "JSON"}
            </Button>
            <Button variant="outline" disabled={importing} className="gap-2" onClick={() => xlsxFileRef.current?.click()}>
              <UploadIcon className="size-4" /> {importing ? "Importing…" : "Excel"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
