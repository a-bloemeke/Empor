"use client"

import { useState, useTransition } from "react"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { submitResponse } from "./actions"
import Link from "next/link"

type DateOption = { id: string; date: string }
type QuestionOption = { id: string; text: string; allowFreeText: boolean }
type Question = { id: string; text: string; options: QuestionOption[] }
type ExistingResponse = {
  dateVotes: { dateOptionId: string; availability: string }[]
  answers: { questionId: string; optionId: string | null; freeText: string | null }[]
}
type DateResult = { date: string; yes: number; maybe: number; no: number }
type QuestionResult = {
  questionId: string
  questionText: string
  options: { text: string; count: number; freeTexts: string[] }[]
}
type Results = {
  dateResults: DateResult[]
  questionResults: QuestionResult[]
  totalResponses: number
}
type EventData = {
  id: string
  title: string
  description: string | null
  status: string
  dateOptions: DateOption[]
  questions: Question[]
  existingResponse: ExistingResponse | null
  results: Results | null
  isOrganizer: boolean
}

function StatusBadge({ status }: { status: string }) {
  if (status === "OPEN") return <Badge className="bg-green-600 text-white">Offen</Badge>
  if (status === "CLOSED") return <Badge variant="secondary">Abgeschlossen</Badge>
  return <Badge variant="outline">Entwurf</Badge>
}

function AvailabilityButton({
  value,
  selected,
  onClick,
}: {
  value: "YES" | "NO" | "MAYBE"
  selected: boolean
  onClick: () => void
}) {
  const labels = { YES: "✓ Ja", MAYBE: "~ Vielleicht", NO: "✗ Nein" }
  const colors = {
    YES: selected ? "bg-green-600 text-white border-green-600" : "border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/40",
    MAYBE: selected ? "bg-yellow-500 text-white border-yellow-500" : "border-yellow-300 text-yellow-700 hover:bg-yellow-50 dark:border-yellow-700 dark:text-yellow-400 dark:hover:bg-yellow-950/40",
    NO: selected ? "bg-red-500 text-white border-red-500" : "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30",
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors ${colors[value]}`}
    >
      {labels[value]}
    </button>
  )
}

function DateAvailabilityMatrix({
  dateOptions,
  votes,
  onChange,
}: {
  dateOptions: DateOption[]
  votes: Record<string, "YES" | "MAYBE" | "NO">
  onChange: (dateOptionId: string, value: "YES" | "MAYBE" | "NO") => void
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">Terminfindung</h2>
      <p className="text-sm text-muted-foreground">Bitte markiere für jeden vorgeschlagenen Termin deine Verfügbarkeit.</p>
      <div className="space-y-2 mt-3">
        {dateOptions.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <span className="text-sm font-medium">{format(new Date(d.date), "EEEE, d. MMMM yyyy", { locale: de })}</span>
            <div className="flex items-center gap-1.5">
              <AvailabilityButton value="YES" selected={votes[d.id] === "YES"} onClick={() => onChange(d.id, "YES")} />
              <AvailabilityButton value="MAYBE" selected={votes[d.id] === "MAYBE"} onClick={() => onChange(d.id, "MAYBE")} />
              <AvailabilityButton value="NO" selected={votes[d.id] === "NO"} onClick={() => onChange(d.id, "NO")} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function QuestionForm({
  question,
  selectedOptionId,
  freeText,
  onOptionChange,
  onFreeTextChange,
}: {
  question: Question
  selectedOptionId: string | null
  freeText: string
  onOptionChange: (questionId: string, optionId: string) => void
  onFreeTextChange: (questionId: string, text: string) => void
}) {
  const selectedOption = question.options.find((o) => o.id === selectedOptionId)

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{question.text}</p>
      <div className="space-y-2 ml-1">
        {question.options.map((o) => (
          <label key={o.id} className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="radio"
              name={`question-${question.id}`}
              value={o.id}
              checked={selectedOptionId === o.id}
              onChange={() => onOptionChange(question.id, o.id)}
              className="mt-0.5"
            />
            <span className="text-sm">{o.text}</span>
          </label>
        ))}
      </div>
      {selectedOption?.allowFreeText && (
        <Input
          placeholder="Dein Vorschlag…"
          value={freeText}
          onChange={(e) => onFreeTextChange(question.id, e.target.value)}
          className="mt-1 ml-1"
        />
      )}
    </div>
  )
}

function ResultsView({ results, dateOptions, questions }: { results: Results; dateOptions: DateOption[]; questions: Question[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-1">Ergebnisse</h2>
        <p className="text-xs text-muted-foreground">{results.totalResponses} Antwort{results.totalResponses !== 1 ? "en" : ""} eingegangen</p>
      </div>

      {results.dateResults.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Terminfindung</h3>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Datum</th>
                  <th className="px-3 py-2 text-center font-medium text-green-700 dark:text-green-400">✓ Ja</th>
                  <th className="px-3 py-2 text-center font-medium text-yellow-700 dark:text-yellow-400">~ Vielleicht</th>
                  <th className="px-3 py-2 text-center font-medium text-red-600 dark:text-red-400">✗ Nein</th>
                </tr>
              </thead>
              <tbody>
                {results.dateResults
                  .slice()
                  .sort((a, b) => b.yes - a.yes || b.maybe - a.maybe)
                  .map((r) => {
                    const dateOption = dateOptions.find((d) => d.date === r.date)
                    return (
                      <tr key={r.date} className="border-t">
                        <td className="px-3 py-2">{format(new Date(r.date), "EEE, d. MMM yyyy", { locale: de })}</td>
                        <td className="px-3 py-2 text-center font-semibold text-green-700 dark:text-green-400">{r.yes}</td>
                        <td className="px-3 py-2 text-center text-yellow-700 dark:text-yellow-400">{r.maybe}</td>
                        <td className="px-3 py-2 text-center text-red-600 dark:text-red-400">{r.no}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {results.questionResults.length > 0 && (
        <div className={`grid gap-4 ${results.questionResults.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {results.questionResults.map((qr) => {
            const total = qr.options.reduce((s, o) => s + o.count, 0)
            return (
              <div key={qr.questionId} className="space-y-2">
                <h3 className="text-sm font-semibold">{qr.questionText}</h3>
                <div className="space-y-1.5">
                  {qr.options.map((o, idx) => (
                    <div key={idx}>
                      <div className="flex items-center justify-between text-sm mb-0.5">
                        <span>{o.text}</span>
                        <span className="font-semibold tabular-nums">{o.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: total > 0 ? `${(o.count / total) * 100}%` : "0%" }}
                        />
                      </div>
                      {o.freeTexts.length > 0 && (
                        <ul className="mt-1 ml-2 space-y-0.5">
                          {o.freeTexts.map((t, i) => (
                            <li key={i} className="text-xs text-muted-foreground">„{t}"</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function EventClient({ event }: { event: EventData }) {
  const [dateVotes, setDateVotes] = useState<Record<string, "YES" | "MAYBE" | "NO">>(() => {
    const init: Record<string, "YES" | "MAYBE" | "NO"> = {}
    if (event.existingResponse) {
      for (const v of event.existingResponse.dateVotes) {
        init[v.dateOptionId] = v.availability as "YES" | "MAYBE" | "NO"
      }
    }
    return init
  })

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string | null>>(() => {
    const init: Record<string, string | null> = {}
    if (event.existingResponse) {
      for (const a of event.existingResponse.answers) {
        if (a.optionId) init[a.questionId] = a.optionId
      }
    }
    return init
  })

  const [freeTexts, setFreeTexts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    if (event.existingResponse) {
      for (const a of event.existingResponse.answers) {
        if (a.freeText) init[a.questionId] = a.freeText
      }
    }
    return init
  })

  const [pending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(!!event.existingResponse)

  function handleDateVoteChange(dateOptionId: string, value: "YES" | "MAYBE" | "NO") {
    setDateVotes((prev) => ({ ...prev, [dateOptionId]: value }))
    if (submitted) setSubmitted(false)
  }

  function handleOptionChange(questionId: string, optionId: string) {
    setSelectedOptions((prev) => ({ ...prev, [questionId]: optionId }))
    if (submitted) setSubmitted(false)
  }

  function handleFreeTextChange(questionId: string, text: string) {
    setFreeTexts((prev) => ({ ...prev, [questionId]: text }))
    if (submitted) setSubmitted(false)
  }

  function handleSubmit() {
    const dvotes = event.dateOptions
      .filter((d) => dateVotes[d.id])
      .map((d) => ({ dateOptionId: d.id, availability: dateVotes[d.id] }))

    const answers = event.questions
      .map((q) => {
        const optionId = selectedOptions[q.id] ?? undefined
        const freeText = optionId ? (freeTexts[q.id] ?? undefined) : undefined
        return { questionId: q.id, optionId, freeText }
      })
      .filter((a) => a.optionId || a.freeText)

    startTransition(async () => {
      const res = await submitResponse(event.id, dvotes, answers)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(event.existingResponse ? "Antwort aktualisiert." : "Antwort gespeichert.")
      setSubmitted(true)
    })
  }

  const showForm = event.status === "OPEN"
  const showResults = event.results !== null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold">{event.title}</h1>
          <StatusBadge status={event.status} />
        </div>
        {event.description && <p className="text-muted-foreground">{event.description}</p>}
        {event.isOrganizer && (
          <Link href="/admin/events" className="text-xs text-amber-600 dark:text-amber-400 hover:underline mt-1 inline-block">
            ⚙ Veranstaltung verwalten →
          </Link>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent className="space-y-6 pt-6">
            {event.dateOptions.length > 0 && (
              <DateAvailabilityMatrix
                dateOptions={event.dateOptions}
                votes={dateVotes}
                onChange={handleDateVoteChange}
              />
            )}

            {event.questions.length > 0 && (
              <div className="space-y-5">
                <h2 className="text-base font-semibold">Weitere Fragen</h2>
                {event.questions.map((q) => (
                  <QuestionForm
                    key={q.id}
                    question={q}
                    selectedOptionId={selectedOptions[q.id] ?? null}
                    freeText={freeTexts[q.id] ?? ""}
                    onOptionChange={handleOptionChange}
                    onFreeTextChange={handleFreeTextChange}
                  />
                ))}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={handleSubmit} disabled={pending}>
                {pending ? "Wird gespeichert…" : submitted ? "Antwort aktualisieren" : "Antwort speichern"}
              </Button>
              {submitted && !pending && (
                <span className="text-sm text-green-600 dark:text-green-400">✓ Gespeichert</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {showResults && event.results && (
        <Card>
          <CardContent className="pt-6">
            <ResultsView
              results={event.results}
              dateOptions={event.dateOptions}
              questions={event.questions}
            />
          </CardContent>
        </Card>
      )}

      {event.status === "CLOSED" && !showResults && (
        <p className="text-sm text-muted-foreground">Diese Umfrage ist abgeschlossen. Keine Ergebnisse verfügbar.</p>
      )}
    </div>
  )
}
