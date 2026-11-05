import { auth } from "@/auth"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { EventClient } from "./event-client"

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const currentUserId = session?.user?.id ?? null
  const isOrganizer = session?.user?.role === "ORGANIZER"

  const event = await db.event.findUnique({
    where: { id },
    include: {
      dateOptions: { orderBy: { order: "asc" } },
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
    },
  })

  if (!event) notFound()
  if (event.status === "DRAFT" && !isOrganizer) notFound()

  const existingResponse = currentUserId
    ? await db.eventResponse.findUnique({
        where: { eventId_playerId: { eventId: id, playerId: currentUserId } },
        include: { dateVotes: true, answers: true },
      })
    : null

  // Compute results for CLOSED events or organizers
  let results: null | {
    dateResults: { date: string; yes: number; maybe: number; no: number }[]
    questionResults: { questionId: string; questionText: string; options: { text: string; count: number; freeTexts: string[] }[] }[]
    totalResponses: number
  } = null

  if (event.status === "CLOSED" || isOrganizer) {
    const allResponses = await db.eventResponse.findMany({
      where: { eventId: id },
      include: { dateVotes: true, answers: true },
    })

    const dateResults = event.dateOptions.map((d) => {
      let yes = 0, maybe = 0, no = 0
      for (const r of allResponses) {
        const vote = r.dateVotes.find((v) => v.dateOptionId === d.id)
        if (vote?.availability === "YES") yes++
        else if (vote?.availability === "MAYBE") maybe++
        else if (vote?.availability === "NO") no++
      }
      return { date: d.date.toISOString(), yes, maybe, no }
    })

    const questionResults = event.questions.map((q) => {
      const options = q.options.map((o) => {
        let count = 0
        const freeTexts: string[] = []
        for (const r of allResponses) {
          const answer = r.answers.find((a) => a.questionId === q.id && a.optionId === o.id)
          if (answer) {
            count++
            if (answer.freeText) freeTexts.push(answer.freeText)
          }
        }
        return { text: o.text, count, freeTexts }
      })
      options.sort((a, b) => b.count - a.count)
      return { questionId: q.id, questionText: q.text, options }
    })

    results = { dateResults, questionResults, totalResponses: allResponses.length }
  }

  const serialized = {
    id: event.id,
    title: event.title,
    description: event.description,
    status: event.status as string,
    dateOptions: event.dateOptions.map((d) => ({ id: d.id, date: d.date.toISOString() })),
    questions: event.questions.map((q) => ({
      id: q.id,
      text: q.text,
      options: q.options.map((o) => ({ id: o.id, text: o.text, allowFreeText: o.allowFreeText })),
    })),
    existingResponse: existingResponse
      ? {
          dateVotes: existingResponse.dateVotes.map((v) => ({
            dateOptionId: v.dateOptionId,
            availability: v.availability as string,
          })),
          answers: existingResponse.answers.map((a) => ({
            questionId: a.questionId,
            optionId: a.optionId,
            freeText: a.freeText,
          })),
        }
      : null,
    results,
    isOrganizer,
  }

  return <EventClient event={serialized} />
}
