"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { notifyOrganizersSessionRegistration, sendGameDayCancellation, notifyOrganizersCancellation, sendRsvpConfirmation } from "@/lib/email"
import { buildPlayerNames } from "@/lib/player-names"
import { format } from "date-fns"
import { de } from "date-fns/locale"
import { endSession } from "@/app/(app)/sessions/[id]/actions"

export { endSession }

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
  if (s.status !== "SCHEDULED" && s.status !== "IN_PROGRESS") throw new Error("Only scheduled or in-progress sessions can be cancelled.")

  await db.session.update({ where: { id: sessionId }, data: { status: "CANCELLED" } })
  // intentionally no revalidatePath here — caller triggers revalidation after the email dialog
}

export async function revalidateSchedule() {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")
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
    where: { passwordHash: { not: null }, active: true },
    select: { id: true, firstName: true, lastName: true, nickname: true, email: true, emailNotifications: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })

  const respondedIds = new Set(s.registrations.map((r) => r.playerId))
  const registered = s.registrations.filter((r) => r.status === "REGISTERED").map((r) => r.player)
  const cancelled = s.registrations.filter((r) => r.status === "CANCELLED").map((r) => r.player)
  const noAnswer = allPlayers.filter((p) => !respondedIds.has(p.id))

  const displayNames = buildPlayerNames(allPlayers)
  const dname = (p: { id: string }) => displayNames.get(p.id) ?? p.id

  const dateStr = format(s.date, "EEEE, d. MMMM yyyy", { locale: de })

  const registeredNames = registered.map(dname).join(", ")
  const cancelledNames = cancelled.map(dname).join(", ")
  const noAnswerNames = noAnswer.map(dname).join(", ")

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
      name: dname(p),
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

  const self = await db.player.findUnique({ where: { id: authSession.user.id }, select: { active: true } })
  if (!self?.active) throw new Error("Dein Konto ist derzeit inaktiv. Bitte wende dich an den Organisator.")

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
    select: { firstName: true, lastName: true, email: true, emailNotifications: true },
  })
  if (player) {
    await notifyOrganizersSessionRegistration(s, player)
    if (player.emailNotifications && player.email) {
      await sendRsvpConfirmation(s, player)
    }
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

  const wasRegistered = reg?.status === "REGISTERED"

  if (reg) {
    if (reg.status === "CANCELLED") throw new Error("Du hast bereits abgesagt.")
    await db.sessionRegistration.update({
      where: { id: reg.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), beerBringer: false },
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

  const player = await db.player.findUnique({
    where: { id: authSession.user.id },
    select: { firstName: true, lastName: true, email: true },
  })
  if (player) {
    await notifyOrganizersCancellation(s, player, wasRegistered)
  }

  revalidatePath("/schedule")
}

export async function toggleBeer(sessionId: string) {
  const authSession = await auth()
  if (!authSession?.user?.id) throw new Error("Unauthorized")

  const s = await db.session.findUnique({ where: { id: sessionId } })
  if (!s) throw new Error("Session not found.")
  if (s.status !== "SCHEDULED") throw new Error("Registration is closed for this session.")

  const myReg = await db.sessionRegistration.findUnique({
    where: { sessionId_playerId: { sessionId, playerId: authSession.user.id } },
  })
  if (!myReg || myReg.status !== "REGISTERED") {
    throw new Error("Du musst angemeldet sein, um Bier mitzubringen.")
  }

  if (myReg.beerBringer) {
    await db.sessionRegistration.update({
      where: { id: myReg.id },
      data: { beerBringer: false },
    })
  } else {
    await db.$transaction([
      db.sessionRegistration.updateMany({
        where: { sessionId, beerBringer: true },
        data: { beerBringer: false },
      }),
      db.sessionRegistration.update({
        where: { id: myReg.id },
        data: { beerBringer: true },
      }),
    ])
  }

  revalidatePath("/schedule")
}
