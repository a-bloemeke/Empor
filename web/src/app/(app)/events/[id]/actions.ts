"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

type DateVoteInput = { dateOptionId: string; availability: "YES" | "NO" | "MAYBE" }
type AnswerInput = { questionId: string; optionId?: string; freeText?: string }
type ActionResult = { ok: true } | { error: string }

export async function submitResponse(
  eventId: string,
  dateVotes: DateVoteInput[],
  answers: AnswerInput[],
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Nicht angemeldet." }
  const playerId = session.user.id

  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      dateOptions: { select: { id: true } },
      questions: { include: { options: { select: { id: true, questionId: true } } } },
    },
  })
  if (!event) return { error: "Veranstaltung nicht gefunden." }
  if (event.status !== "OPEN") return { error: "Diese Umfrage ist nicht mehr offen." }

  const validDateIds = new Set(event.dateOptions.map((d) => d.id))
  for (const v of dateVotes) {
    if (!validDateIds.has(v.dateOptionId)) return { error: "Ungültige Datumsangabe." }
  }

  const optionsByQuestion = new Map<string, Set<string>>()
  for (const q of event.questions) {
    optionsByQuestion.set(q.id, new Set(q.options.map((o) => o.id)))
  }
  for (const a of answers) {
    const validOptions = optionsByQuestion.get(a.questionId)
    if (!validOptions) return { error: "Ungültige Frage." }
    if (a.optionId && !validOptions.has(a.optionId)) return { error: "Ungültige Antwortoption." }
    if (!a.optionId && !a.freeText) return { error: "Antwort darf nicht leer sein." }
  }

  await db.$transaction(async (tx) => {
    const response = await tx.eventResponse.upsert({
      where: { eventId_playerId: { eventId, playerId } },
      create: { eventId, playerId },
      update: { updatedAt: new Date() },
    })

    await tx.eventDateVote.deleteMany({ where: { responseId: response.id } })
    if (dateVotes.length > 0) {
      await tx.eventDateVote.createMany({
        data: dateVotes.map((v) => ({
          responseId: response.id,
          dateOptionId: v.dateOptionId,
          availability: v.availability,
        })),
      })
    }

    await tx.eventAnswer.deleteMany({ where: { responseId: response.id } })
    if (answers.length > 0) {
      await tx.eventAnswer.createMany({
        data: answers.map((a) => ({
          responseId: response.id,
          questionId: a.questionId,
          optionId: a.optionId ?? null,
          freeText: a.freeText ?? null,
        })),
      })
    }
  })

  revalidatePath(`/events/${eventId}`)
  return { ok: true }
}
