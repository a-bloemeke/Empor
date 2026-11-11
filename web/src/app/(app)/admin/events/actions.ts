"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { sendEventStatusEmail } from "@/lib/email"

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

export async function getEventEmailDefaults(eventId: string): Promise<
  { error: string } | {
    ok: true
    eventTitle: string
    subject: string
    allPlayers: { id: string; name: string; email: string }[]
    respondedPlayerIds: string[]
    totalResponses: number
  }
> {
  await checkOrganizer()
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      dateOptions: { orderBy: { order: "asc" } },
      questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } },
      responses: { select: { playerId: true } },
    },
  })
  if (!event) return { error: "Veranstaltung nicht gefunden." }

  const rawPlayers = await db.player.findMany({
    where: { active: true, email: { not: { endsWith: "@empor.guest" } } },
    select: { id: true, firstName: true, lastName: true, nickname: true, email: true },
    orderBy: { firstName: "asc" },
  })
  const allPlayers = rawPlayers.map((p) => ({
    id: p.id,
    name: p.nickname ? `${p.firstName} "${p.nickname}" ${p.lastName}` : `${p.firstName} ${p.lastName}`.trim(),
    email: p.email,
  }))

  const respondedPlayerIds = event.responses.map((r) => r.playerId)

  return {
    ok: true,
    eventTitle: event.title,
    subject: `${event.title} – Planungsstand`,
    allPlayers,
    respondedPlayerIds,
    totalResponses: respondedPlayerIds.length,
  }
}

export async function getEventResponses(eventId: string): Promise<
  | { error: string }
  | {
      ok: true
      responses: {
        playerId: string
        playerName: string
        declineReason: string | null
        dateVotes: { dateOptionId: string; availability: string }[]
        answers: { questionId: string; optionId: string | null; optionText: string | null; freeText: string | null }[]
      }[]
    }
> {
  await checkOrganizer()
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      responses: {
        include: {
          player: { select: { firstName: true, lastName: true, nickname: true } },
          dateVotes: true,
          answers: { include: { option: { select: { text: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  })
  if (!event) return { error: "Veranstaltung nicht gefunden." }
  return {
    ok: true,
    responses: event.responses.map((r) => ({
      playerId: r.playerId,
      playerName: r.player.nickname
        ? `${r.player.firstName} "${r.player.nickname}" ${r.player.lastName}`
        : `${r.player.firstName} ${r.player.lastName}`.trim(),
      declineReason: r.declineReason,
      dateVotes: r.dateVotes.map((v) => ({ dateOptionId: v.dateOptionId, availability: v.availability as string })),
      answers: r.answers.map((a) => ({
        questionId: a.questionId,
        optionId: a.optionId,
        optionText: a.option?.text ?? null,
        freeText: a.freeText,
      })),
    })),
  }
}

export async function sendEventStatusEmailAction(
  eventId: string,
  subject: string,
  introText: string,
  recipientPlayerIds: string[],
): Promise<ActionResult> {
  await checkOrganizer()
  if (!subject.trim()) return { error: "Betreff ist erforderlich." }
  if (recipientPlayerIds.length === 0) return { error: "Bitte mindestens einen Empfänger wählen." }

  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      dateOptions: { orderBy: { order: "asc" } },
      questions: {
        orderBy: { order: "asc" },
        include: {
          options: { orderBy: { order: "asc" } },
          answers: { include: { option: true } },
        },
      },
      responses: {
        include: {
          dateVotes: true,
          answers: { include: { option: true } },
        },
      },
    },
  })
  if (!event) return { error: "Veranstaltung nicht gefunden." }

  // Compute date results
  const dateResults = event.dateOptions.map((d) => {
    const votes = event.responses.flatMap((r) => r.dateVotes.filter((v) => v.dateOptionId === d.id))
    return {
      date: d.date,
      yes: votes.filter((v) => v.availability === "YES").length,
      maybe: votes.filter((v) => v.availability === "MAYBE").length,
      no: votes.filter((v) => v.availability === "NO").length,
    }
  })

  // Compute question results
  const questionResults = event.questions.map((q) => ({
    questionText: q.text,
    options: q.options.map((o) => {
      const matchingAnswers = q.answers.filter((a) => a.optionId === o.id)
      return {
        text: o.text,
        count: matchingAnswers.length,
        freeTexts: matchingAnswers.filter((a) => a.freeText).map((a) => a.freeText!),
      }
    }).sort((a, b) => b.count - a.count),
  }))

  const declineReasons = event.responses
    .filter((r) => r.declineReason)
    .map((r) => r.declineReason!)

  const recipients = await db.player.findMany({
    where: { id: { in: recipientPlayerIds }, active: true },
    select: { email: true },
  })
  const recipientEmails = recipients.map((p) => p.email)

  try {
    await sendEventStatusEmail(
      { id: event.id, title: event.title },
      subject,
      introText,
      recipientEmails,
      { dateResults, questionResults, totalResponses: event.responses.length, declineReasons },
    )
  } catch (e) {
    return { error: (e as Error).message }
  }
  return { ok: true }
}
