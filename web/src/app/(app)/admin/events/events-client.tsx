"use client"

import { useState, useTransition } from "react"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import {
  createEvent,
  updateEvent,
  openEvent,
  closeEvent,
  deleteEvent,
  addDateOption,
  removeDateOption,
  addQuestion,
  updateQuestion,
  removeQuestion,
  addQuestionOption,
  updateQuestionOption,
  removeQuestionOption,
} from "./actions"

type QuestionOption = { id: string; text: string; order: number; allowFreeText: boolean }
type Question = { id: string; text: string; order: number; options: QuestionOption[] }
type DateOption = { id: string; date: string; order: number }

type Event = {
  id: string
  title: string
  description: string | null
  status: string
  createdAt: string
  responseCount: number
  dateOptions: DateOption[]
  questions: Question[]
}

function StatusBadge({ status }: { status: string }) {
  if (status === "OPEN") return <Badge className="bg-green-600 text-white">Offen</Badge>
  if (status === "CLOSED") return <Badge variant="secondary">Geschlossen</Badge>
  return <Badge variant="outline">Entwurf</Badge>
}

function CreateEventDialog() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    if (!title.trim()) { toast.error("Titel ist erforderlich."); return }
    startTransition(async () => {
      const res = await createEvent(title, description || undefined)
      if ("error" in res) { toast.error(res.error); return }
      toast.success("Veranstaltung erstellt.")
      setOpen(false)
      setTitle("")
      setDescription("")
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="bg-amber-500 hover:bg-amber-600 text-white" />}>
        + Neue Veranstaltung
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neue Veranstaltung</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ev-title">Titel *</Label>
            <Input id="ev-title" placeholder="z. B. Weihnachtsfeier 2026" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Beschreibung (optional)</Label>
            <Textarea id="ev-desc" placeholder="Kurze Info zur Veranstaltung" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Wird erstellt…" : "Erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditTitleDialog({ event }: { event: Event }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(event.title)
  const [description, setDescription] = useState(event.description ?? "")
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    if (!title.trim()) { toast.error("Titel ist erforderlich."); return }
    startTransition(async () => {
      const res = await updateEvent(event.id, title, description || undefined)
      if ("error" in res) { toast.error(res.error); return }
      toast.success("Gespeichert.")
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40" />}>
        Bearbeiten
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Veranstaltung bearbeiten</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ev-edit-title">Titel *</Label>
            <Input id="ev-edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-edit-desc">Beschreibung (optional)</Label>
            <Textarea id="ev-edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Wird gespeichert…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DateOptionsPanel({ event }: { event: Event }) {
  const [newDate, setNewDate] = useState("")
  const [pending, startTransition] = useTransition()
  const isDraft = event.status === "DRAFT"

  function handleAdd() {
    if (!newDate) { toast.error("Bitte ein Datum wählen."); return }
    startTransition(async () => {
      const res = await addDateOption(event.id, newDate)
      if ("error" in res) { toast.error(res.error); return }
      setNewDate("")
    })
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const res = await removeDateOption(id)
      if ("error" in res) toast.error(res.error)
    })
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Datumoptionen</h3>
      {event.dateOptions.length === 0 ? (
        <p className="text-xs text-muted-foreground">Noch keine Datumoptionen.</p>
      ) : (
        <ul className="space-y-1">
          {event.dateOptions.map((d) => (
            <li key={d.id} className="flex items-center justify-between text-sm">
              <span>{format(new Date(d.date), "EEEE, d. MMMM yyyy", { locale: de })}</span>
              {isDraft && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-destructive hover:text-destructive" disabled={pending} onClick={() => handleRemove(d.id)}>
                  ✕
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isDraft && (
        <div className="flex items-center gap-2">
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-8 text-sm" />
          <Button size="sm" variant="outline" disabled={pending} onClick={handleAdd}>
            + Datum
          </Button>
        </div>
      )}
    </div>
  )
}

function QuestionOptionRow({ option, questionId, isDraft }: { option: QuestionOption; questionId: string; isDraft: boolean }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(option.text)
  const [allowFreeText, setAllowFreeText] = useState(option.allowFreeText)
  const [pending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const res = await updateQuestionOption(option.id, text, allowFreeText)
      if ("error" in res) { toast.error(res.error); return }
      setEditing(false)
    })
  }

  function handleRemove() {
    startTransition(async () => {
      const res = await removeQuestionOption(option.id)
      if ("error" in res) toast.error(res.error)
    })
  }

  if (editing) {
    return (
      <li className="flex items-center gap-2 text-sm">
        <Input value={text} onChange={(e) => setText(e.target.value)} className="h-7 text-sm flex-1" />
        <label className="flex items-center gap-1 text-xs whitespace-nowrap">
          <input type="checkbox" checked={allowFreeText} onChange={(e) => setAllowFreeText(e.target.checked)} />
          Freitext
        </label>
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={pending} onClick={handleSave}>✓</Button>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(false)}>✕</Button>
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between text-sm">
      <span>
        {option.text}
        {option.allowFreeText && <span className="ml-1.5 text-xs text-muted-foreground">(+ Freitext)</span>}
      </span>
      {isDraft && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={pending} onClick={() => setEditing(true)}>✎</Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive hover:text-destructive" disabled={pending} onClick={handleRemove}>✕</Button>
        </div>
      )}
    </li>
  )
}

function QuestionPanel({ question, isDraft }: { question: Question; isDraft: boolean }) {
  const [editingText, setEditingText] = useState(false)
  const [qText, setQText] = useState(question.text)
  const [newOptionText, setNewOptionText] = useState("")
  const [newOptionFreeText, setNewOptionFreeText] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSaveQuestion() {
    startTransition(async () => {
      const res = await updateQuestion(question.id, qText)
      if ("error" in res) { toast.error(res.error); return }
      setEditingText(false)
    })
  }

  function handleRemoveQuestion() {
    if (!confirm("Frage wirklich löschen?")) return
    startTransition(async () => {
      const res = await removeQuestion(question.id)
      if ("error" in res) toast.error(res.error)
    })
  }

  function handleAddOption() {
    if (!newOptionText.trim()) { toast.error("Optionstext eingeben."); return }
    startTransition(async () => {
      const res = await addQuestionOption(question.id, newOptionText, newOptionFreeText)
      if ("error" in res) { toast.error(res.error); return }
      setNewOptionText("")
      setNewOptionFreeText(false)
    })
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        {editingText ? (
          <div className="flex items-center gap-2 flex-1">
            <Input value={qText} onChange={(e) => setQText(e.target.value)} className="h-7 text-sm" />
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={pending} onClick={handleSaveQuestion}>✓</Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditingText(false)}>✕</Button>
          </div>
        ) : (
          <p className="text-sm font-medium">{question.text}</p>
        )}
        {isDraft && !editingText && (
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setEditingText(true)}>✎</Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive hover:text-destructive" disabled={pending} onClick={handleRemoveQuestion}>Löschen</Button>
          </div>
        )}
      </div>
      <ul className="space-y-1 ml-2">
        {question.options.map((o) => (
          <QuestionOptionRow key={o.id} option={o} questionId={question.id} isDraft={isDraft} />
        ))}
      </ul>
      {isDraft && (
        <div className="flex items-center gap-2 mt-2">
          <Input
            placeholder="Neue Option…"
            value={newOptionText}
            onChange={(e) => setNewOptionText(e.target.value)}
            className="h-7 text-sm flex-1"
          />
          <label className="flex items-center gap-1 text-xs whitespace-nowrap">
            <input type="checkbox" checked={newOptionFreeText} onChange={(e) => setNewOptionFreeText(e.target.checked)} />
            Freitext
          </label>
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={pending} onClick={handleAddOption}>
            + Option
          </Button>
        </div>
      )}
    </div>
  )
}

function QuestionsPanel({ event }: { event: Event }) {
  const [newQuestionText, setNewQuestionText] = useState("")
  const [pending, startTransition] = useTransition()
  const isDraft = event.status === "DRAFT"

  function handleAddQuestion() {
    if (!newQuestionText.trim()) { toast.error("Fragentext eingeben."); return }
    startTransition(async () => {
      const res = await addQuestion(event.id, newQuestionText)
      if ("error" in res) { toast.error(res.error); return }
      setNewQuestionText("")
    })
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Umfragefragen</h3>
      {event.questions.length === 0 ? (
        <p className="text-xs text-muted-foreground">Noch keine Fragen.</p>
      ) : (
        <div className="space-y-2">
          {event.questions.map((q) => (
            <QuestionPanel key={q.id} question={q} isDraft={isDraft} />
          ))}
        </div>
      )}
      {isDraft && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="Neue Frage…"
            value={newQuestionText}
            onChange={(e) => setNewQuestionText(e.target.value)}
            className="h-8 text-sm"
          />
          <Button size="sm" variant="outline" disabled={pending} onClick={handleAddQuestion}>
            + Frage
          </Button>
        </div>
      )}
    </div>
  )
}

function EventDetailPanel({ event }: { event: Event }) {
  const [pending, startTransition] = useTransition()

  function handleOpen() {
    startTransition(async () => {
      const res = await openEvent(event.id)
      if ("error" in res) { toast.error(res.error); return }
      toast.success("Veranstaltung geöffnet.")
    })
  }

  function handleClose() {
    startTransition(async () => {
      const res = await closeEvent(event.id)
      if ("error" in res) { toast.error(res.error); return }
      toast.success("Veranstaltung geschlossen.")
    })
  }

  function handleDelete() {
    if (!confirm("Veranstaltung wirklich löschen?")) return
    startTransition(async () => {
      const res = await deleteEvent(event.id)
      if ("error" in res) toast.error(res.error)
      else toast.success("Veranstaltung gelöscht.")
    })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{event.title}</CardTitle>
            {event.description && <p className="text-sm text-muted-foreground mt-0.5">{event.description}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={event.status} />
            <EditTitleDialog event={event} />
            {event.status === "DRAFT" && (
              <Button size="sm" variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40" disabled={pending} onClick={handleOpen}>
                Öffnen
              </Button>
            )}
            {event.status === "OPEN" && (
              <Button size="sm" variant="outline" disabled={pending} onClick={handleClose}>
                Schließen
              </Button>
            )}
            {event.status === "DRAFT" && (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={pending} onClick={handleDelete}>
                Löschen
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{event.responseCount} Antwort{event.responseCount !== 1 ? "en" : ""}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <DateOptionsPanel event={event} />
        <QuestionsPanel event={event} />
        {event.status !== "DRAFT" && (
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-3">
            <p className="text-xs text-blue-700 dark:text-blue-400">
              Ergebnisse sind auf der Veranstaltungsseite{" "}
              <a href={`/events/${event.id}`} className="underline font-medium" target="_blank" rel="noreferrer">
                /events/{event.id}
              </a>{" "}
              einsehbar.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function EventsAdminClient({ events }: { events: Event[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(events[0]?.id ?? null)
  const selectedEvent = events.find((e) => e.id === selectedId) ?? null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">Veranstaltungen</h1>
          <p className="text-muted-foreground text-sm">
            Weihnachtsfeiern, Sommertreffen und andere Sonderveranstaltungen planen und Umfragen verwalten.
          </p>
        </div>
        <CreateEventDialog />
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Noch keine Veranstaltungen. Erstelle die erste Veranstaltung oben.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Veranstaltung</TableHead>
                    <TableHead className="text-right">Antworten</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow
                      key={e.id}
                      className={`cursor-pointer ${selectedId === e.id ? "bg-muted" : ""}`}
                      onClick={() => setSelectedId(e.id)}
                    >
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{e.title}</p>
                          <StatusBadge status={e.status} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{e.responseCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {selectedEvent ? (
            <EventDetailPanel event={selectedEvent} />
          ) : (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Veranstaltung auswählen.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
