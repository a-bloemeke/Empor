"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Trash2Icon, PlusIcon } from "lucide-react"
import { deleteQuote, addQuote } from "./actions"

type Quote = { id: string; quote: string; author: string }

export function QuotesClient({ quotes }: { quotes: Quote[] }) {
  const [pending, startTransition] = useTransition()
  const [newQuote, setNewQuote] = useState("")
  const [newAuthor, setNewAuthor] = useState("")

  function handleDelete(id: string, preview: string) {
    if (!confirm(`Zitat löschen?\n„${preview}"`)) return
    startTransition(async () => {
      try {
        await deleteQuote(id)
        toast.success("Zitat gelöscht.")
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  function handleAdd() {
    if (!newQuote.trim() || !newAuthor.trim()) {
      toast.error("Zitat und Autor sind erforderlich.")
      return
    }
    startTransition(async () => {
      try {
        await addQuote(newQuote, newAuthor)
        toast.success("Zitat hinzugefügt.")
        setNewQuote("")
        setNewAuthor("")
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Zitatsammlung</h1>
        <p className="text-muted-foreground">Zitate verwalten, die beim Versenden von Spieltags-Einladungen ausgewählt werden können.</p>
      </div>

      {/* Add new */}
      <div className="rounded-xl border p-5 space-y-4">
        <h2 className="font-semibold">Neues Zitat hinzufügen</h2>
        <div className="space-y-1.5">
          <Label htmlFor="new-quote">Zitat</Label>
          <Textarea
            id="new-quote"
            rows={2}
            value={newQuote}
            onChange={(e) => setNewQuote(e.target.value)}
            placeholder="z. B. Der Ball ist rund."
            className="resize-none"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-author">Autor</Label>
          <Input
            id="new-author"
            value={newAuthor}
            onChange={(e) => setNewAuthor(e.target.value)}
            placeholder="z. B. Sepp Herberger"
          />
        </div>
        <Button onClick={handleAdd} disabled={pending} className="gap-2">
          <PlusIcon className="size-4" /> Hinzufügen
        </Button>
      </div>

      {/* Quote list */}
      <div className="rounded-xl border overflow-hidden">
        <div className="px-4 py-3 text-white font-bold tracking-wide uppercase text-xs"
          style={{ background: "linear-gradient(90deg, oklch(0.20 0.07 150), oklch(0.35 0.12 150))" }}
        >
          Verfügbare Zitate ({quotes.length})
        </div>
        {quotes.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">Keine Zitate vorhanden.</p>
        ) : (
          <ul className="divide-y divide-border">
            {quotes.map((q) => (
              <li key={q.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm italic">„{q.quote}"</p>
                  <p className="text-xs text-muted-foreground mt-0.5">— {q.author}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleDelete(q.id, q.quote.slice(0, 60))}
                  className="shrink-0 text-destructive hover:text-destructive"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
