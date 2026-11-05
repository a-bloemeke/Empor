import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { EventsAdminClient } from "./events-client"

export default async function AdminEventsPage() {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") redirect("/schedule")

  const events = await db.event.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { responses: true } },
      dateOptions: { orderBy: { order: "asc" } },
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
    },
  })

  const serialized = events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    status: e.status as string,
    createdAt: e.createdAt.toISOString(),
    responseCount: e._count.responses,
    dateOptions: e.dateOptions.map((d) => ({ id: d.id, date: d.date.toISOString(), order: d.order })),
    questions: e.questions.map((q) => ({
      id: q.id,
      text: q.text,
      order: q.order,
      options: q.options.map((o) => ({ id: o.id, text: o.text, order: o.order, allowFreeText: o.allowFreeText })),
    })),
  }))

  return (
    <div>
      <EventsAdminClient events={serialized} />
    </div>
  )
}
