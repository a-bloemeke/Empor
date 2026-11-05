"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

type ActionResult = { ok: true } | { error: string }

async function checkOrganizer() {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")
  return session
}

function revalidate() {
  revalidatePath("/admin/events")
  revalidatePath("/schedule")
}

export async function createEvent(title: string, description?: string): Promise<ActionResult> {
  await checkOrganizer()
  if (!title.trim()) return { error: "Titel ist erforderlich." }
  await db.event.create({ data: { title: title.trim(), description: description?.trim() || null } })
  revalidate()
  return { ok: true }
}

export async function updateEvent(id: string, title: string, description?: string): Promise<ActionResult> {
  await checkOrganizer()
  if (!title.trim()) return { error: "Titel ist erforderlich." }
  await db.event.update({ where: { id }, data: { title: title.trim(), description: description?.trim() || null } })
  revalidate()
  return { ok: true }
}

export async function openEvent(id: string): Promise<ActionResult> {
  await checkOrganizer()
  const event = await db.event.findUnique({
    where: { id },
    include: { _count: { select: { dateOptions: true } } },
  })
  if (!event) return { error: "Veranstaltung nicht gefunden." }
  if (event.status !== "DRAFT") return { error: "Nur Entwürfe können geöffnet werden." }
  if (event._count.dateOptions === 0) return { error: "Mindestens eine Datumsoption erforderlich." }
  await db.event.update({ where: { id }, data: { status: "OPEN" } })
  revalidate()
  return { ok: true }
}

export async function closeEvent(id: string): Promise<ActionResult> {
  await checkOrganizer()
  const event = await db.event.findUnique({ where: { id }, select: { status: true } })
  if (!event) return { error: "Veranstaltung nicht gefunden." }
  if (event.status !== "OPEN") return { error: "Nur offene Veranstaltungen können geschlossen werden." }
  await db.event.update({ where: { id }, data: { status: "CLOSED" } })
  revalidate()
  return { ok: true }
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  await checkOrganizer()
  const event = await db.event.findUnique({ where: { id }, select: { status: true } })
  if (!event) return { error: "Veranstaltung nicht gefunden." }
  if (event.status !== "DRAFT") return { error: "Nur Entwürfe können gelöscht werden." }
  await db.event.delete({ where: { id } })
  revalidate()
  return { ok: true }
}

export async function addDateOption(eventId: string, dateIso: string): Promise<ActionResult> {
  await checkOrganizer()
  const event = await db.event.findUnique({ where: { id: eventId }, select: { status: true } })
  if (!event) return { error: "Veranstaltung nicht gefunden." }
  if (event.status !== "DRAFT") return { error: "Datumoptionen können nur im Entwurf bearbeitet werden." }
  const date = new Date(dateIso + "T00:00:00.000Z")
  if (isNaN(date.getTime())) return { error: "Ungültiges Datum." }
  const maxOrder = await db.eventDateOption.aggregate({ where: { eventId }, _max: { order: true } })
  await db.eventDateOption.create({ data: { eventId, date, order: (maxOrder._max.order ?? -1) + 1 } })
  revalidate()
  return { ok: true }
}

export async function removeDateOption(id: string): Promise<ActionResult> {
  await checkOrganizer()
  const opt = await db.eventDateOption.findUnique({ where: { id }, include: { event: { select: { status: true } } } })
  if (!opt) return { error: "Datumsoption nicht gefunden." }
  if (opt.event.status !== "DRAFT") return { error: "Datumoptionen können nur im Entwurf bearbeitet werden." }
  await db.eventDateOption.delete({ where: { id } })
  revalidate()
  return { ok: true }
}

export async function addQuestion(eventId: string, text: string): Promise<ActionResult> {
  await checkOrganizer()
  if (!text.trim()) return { error: "Fragentext ist erforderlich." }
  const event = await db.event.findUnique({ where: { id: eventId }, select: { status: true } })
  if (!event) return { error: "Veranstaltung nicht gefunden." }
  if (event.status !== "DRAFT") return { error: "Fragen können nur im Entwurf bearbeitet werden." }
  const maxOrder = await db.eventQuestion.aggregate({ where: { eventId }, _max: { order: true } })
  await db.eventQuestion.create({ data: { eventId, text: text.trim(), order: (maxOrder._max.order ?? -1) + 1 } })
  revalidate()
  return { ok: true }
}

export async function updateQuestion(id: string, text: string): Promise<ActionResult> {
  await checkOrganizer()
  if (!text.trim()) return { error: "Fragentext ist erforderlich." }
  const q = await db.eventQuestion.findUnique({ where: { id }, include: { event: { select: { status: true } } } })
  if (!q) return { error: "Frage nicht gefunden." }
  if (q.event.status !== "DRAFT") return { error: "Fragen können nur im Entwurf bearbeitet werden." }
  await db.eventQuestion.update({ where: { id }, data: { text: text.trim() } })
  revalidate()
  return { ok: true }
}

export async function removeQuestion(id: string): Promise<ActionResult> {
  await checkOrganizer()
  const q = await db.eventQuestion.findUnique({ where: { id }, include: { event: { select: { status: true } } } })
  if (!q) return { error: "Frage nicht gefunden." }
  if (q.event.status !== "DRAFT") return { error: "Fragen können nur im Entwurf bearbeitet werden." }
  await db.eventQuestion.delete({ where: { id } })
  revalidate()
  return { ok: true }
}

export async function addQuestionOption(questionId: string, text: string, allowFreeText = false): Promise<ActionResult> {
  await checkOrganizer()
  if (!text.trim()) return { error: "Optionstext ist erforderlich." }
  const q = await db.eventQuestion.findUnique({ where: { id: questionId }, include: { event: { select: { status: true } } } })
  if (!q) return { error: "Frage nicht gefunden." }
  if (q.event.status !== "DRAFT") return { error: "Optionen können nur im Entwurf bearbeitet werden." }
  const maxOrder = await db.eventQuestionOption.aggregate({ where: { questionId }, _max: { order: true } })
  await db.eventQuestionOption.create({ data: { questionId, text: text.trim(), allowFreeText, order: (maxOrder._max.order ?? -1) + 1 } })
  revalidate()
  return { ok: true }
}

export async function updateQuestionOption(id: string, text: string, allowFreeText: boolean): Promise<ActionResult> {
  await checkOrganizer()
  if (!text.trim()) return { error: "Optionstext ist erforderlich." }
  const opt = await db.eventQuestionOption.findUnique({
    where: { id },
    include: { question: { include: { event: { select: { status: true } } } } },
  })
  if (!opt) return { error: "Option nicht gefunden." }
  if (opt.question.event.status !== "DRAFT") return { error: "Optionen können nur im Entwurf bearbeitet werden." }
  await db.eventQuestionOption.update({ where: { id }, data: { text: text.trim(), allowFreeText } })
  revalidate()
  return { ok: true }
}

export async function removeQuestionOption(id: string): Promise<ActionResult> {
  await checkOrganizer()
  const opt = await db.eventQuestionOption.findUnique({
    where: { id },
    include: { question: { include: { event: { select: { status: true } } } } },
  })
  if (!opt) return { error: "Option nicht gefunden." }
  if (opt.question.event.status !== "DRAFT") return { error: "Optionen können nur im Entwurf bearbeitet werden." }
  await db.eventQuestionOption.delete({ where: { id } })
  revalidate()
  return { ok: true }
}
