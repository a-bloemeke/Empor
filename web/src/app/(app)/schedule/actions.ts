"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { notifyOrganizersSessionRegistration, sendGameDayCancellation } from "@/lib/email"
import { format } from "date-fns"
import { de } from "date-fns/locale"

export async function createSession(dateIso: string) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const date = new Date(dateIso)
  if (isNaN(date.getTime())) throw new Error("Invalid date.")

  const year = date.getFullYear()
  const season = await db.season.findUnique({ where: { year } })
  if (!season) throw new Error(`No season exists for ${year}. Create one under Admin → Seasons first.`)
  if (season.status === "COMPLETED") throw new Error(`Season ${year} is already closed.`)

  const newSession = await db.session.create({
    data: {
      date,
      seasonId: season.id,
      organizerId: session.user.id,
    },
  })

  revalidatePath("/schedule")
}

export async function cancelSession(sessionId: string) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const s = await db.session.findUnique({ where: { id: sessionId } })
  if (!s) throw new Error("Session not found.")
  if (s.status !== "SCHEDULED") throw new Error("Only scheduled sessions can be cancelled.")

  await db.session.update({ where: { id: sessionId }, data: { status: "CANCELLED" } })
  revalidatePath("/schedule")
}

export async function getCancelEmailDefaults(sessionId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const s = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      registrations: {
        include: {
          player: { select: { id: true, firstName: true, lastName: true, nickname: true } },
        },
      },
    },
  })
  if (!s) throw new Error("Session not found.")

  const allPlayers = await db.player.findMany({
    where: { passwordHash: { not: null } },
    select: { id: true, firstName: true, lastName: true, nickname: true, email: true, emailNotifications: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })

  const respondedIds = new Set(s.registrations.map((r) => r.playerId))
  const registered = s.registrations.filter((r) => r.status === "REGISTERED").map((r) => r.player)
  const cancelled = s.registrations.filter((r) => r.status === "CANCELLED").map((r) => r.player)
  const noAnswer = allPlayers.filter((p) => !respondedIds.has(p.id))

  const abbrev = (p: { firstName: string; lastName: string; nickname: string | null }) => {
    const display = p.nickname ?? p.firstName
    const lastInitial = p.lastName ? ` ${p.lastName[0].toUpperCase()}.` : ""
    return `${display}${lastInitial}`
  }

  const dateStr = format(s.date, "EEEE, d. MMMM yyyy", { locale: de })

  const registeredNames = registered.map(abbrev).join(", ")
  const cancelledNames = cancelled.map(abbrev).join(", ")
  const noAnswerNames = noAnswer.map(abbrev).join(", ")

  const subject = `❌ Spieltag abgesagt – ${dateStr}`

  const body = `Hey Kicker,

leider müssen wir den Spieltag am ${dateStr} absagen.

${registered.length > 0 ? `Ein großes Lob und herzlichen Dank an alle, die sich angemeldet hatten – das zeigt echten Teamgeist! 💪\n✅ Angemeldet: ${registeredNames}\n` : ""}${cancelled.length > 0 ? `\nDanke an alle, die rechtzeitig Bescheid gegeben haben – das hilft uns sehr bei der Planung! 🙏\n❌ Abgesagt: ${cancelledNames}\n` : ""}${noAnswer.length > 0 ? `\nAn alle, die sich bisher nicht gemeldet haben: Bitte denkt daran, dass eine Rückmeldung – egal ob Zu- oder Absage – für die Organisation entscheidend ist. Ohne euer Feedback können wir nicht vernünftig planen. Wir bitten euch, das beim nächsten Mal zu berücksichtigen. ⚠️\nKeine Antwort: ${noAnswerNames}\n` : ""}
Wir melden uns bald mit einem neuen Termin.

Empor Lichtenberg`

  return {
    subject,
    body,
    players: allPlayers.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      email: p.email,
      emailNotifications: p.emailNotifications,
    })),
  }
}

export async function sendCancelEmail(
  sessionId: string,
  subject: string,
  body: string,
  recipientIds: string[],
) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const s = await db.session.findUnique({ where: { id: sessionId } })
  if (!s) throw new Error("Session not found.")
  if (s.status !== "CANCELLED") throw new Error("Session is not cancelled.")

  const players = await db.player.findMany({
    where: { id: { in: recipientIds }, emailNotifications: true },
    select: { email: true },
  })
  const emails = players.map((p) => p.email).filter(Boolean) as string[]

  return sendGameDayCancellation({ id: s.id, date: s.date }, subject, body, emails)
}

export async function reopenCancelledSession(sessionId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const s = await db.session.findUnique({ where: { id: sessionId } })
  if (!s) throw new Error("Session not found.")
  if (s.status !== "CANCELLED") throw new Error("Only cancelled sessions can be reopened this way.")

  await db.session.update({ where: { id: sessionId }, data: { status: "SCHEDULED" } })
  revalidatePath("/schedule")
}

export async function registerSelf(sessionId: string) {
  const authSession = await auth()
  if (!authSession?.user?.id) throw new Error("Unauthorized")

  const s = await db.session.findUnique({ where: { id: sessionId } })
  if (!s) throw new Error("Session not found.")
  if (s.status !== "SCHEDULED") throw new Error("Registration is closed for this session.")

  const existing = await db.sessionRegistration.findUnique({
    where: { sessionId_playerId: { sessionId, playerId: authSession.user.id } },
  })

  if (existing) {
    if (existing.status === "REGISTERED") throw new Error("Already registered.")
    await db.sessionRegistration.update({
      where: { id: existing.id },
      data: { status: "REGISTERED", registeredAt: new Date(), cancelledAt: null },
    })
  } else {
    await db.sessionRegistration.create({
      data: {
        sessionId,
        playerId: authSession.user.id,
        registeredById: authSession.user.id,
        status: "REGISTERED",
      },
    })
  }

  const player = await db.player.findUnique({
    where: { id: authSession.user.id },
    select: { firstName: true, lastName: true, email: true },
  })
  if (player) {
    await notifyOrganizersSessionRegistration(s, player)
  }

  revalidatePath("/schedule")
}

export async function cancelSelf(sessionId: string) {
  const authSession = await auth()
  if (!authSession?.user?.id) throw new Error("Unauthorized")

  const s = await db.session.findUnique({ where: { id: sessionId } })
  if (!s) throw new Error("Session not found.")
  if (s.status !== "SCHEDULED") throw new Error("Registration is closed for this session.")

  const cutoff = new Date(s.date.getTime() - 60 * 60 * 1000)
  if (new Date() >= cutoff) {
    throw new Error("Absagen ist nicht mehr möglich (weniger als 1 Stunde vor Spielbeginn).")
  }

  const reg = await db.sessionRegistration.findUnique({
    where: { sessionId_playerId: { sessionId, playerId: authSession.user.id } },
  })

  if (reg) {
    if (reg.status === "CANCELLED") throw new Error("Du hast bereits abgesagt.")
    await db.sessionRegistration.update({
      where: { id: reg.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    })
  } else {
    await db.sessionRegistration.create({
      data: {
        sessionId,
        playerId: authSession.user.id,
        registeredById: authSession.user.id,
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    })
  }

  revalidatePath("/schedule")
}
