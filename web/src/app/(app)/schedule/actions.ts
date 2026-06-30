"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { notifyOrganizersSessionRegistration } from "@/lib/email"

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

  const cutoff = new Date(s.date.getTime() - 60 * 60 * 1000)
  if (new Date() >= cutoff) {
    throw new Error("Cancellation is not allowed within 1 hour of the session.")
  }

  const reg = await db.sessionRegistration.findUnique({
    where: { sessionId_playerId: { sessionId, playerId: authSession.user.id } },
  })
  if (!reg || reg.status === "CANCELLED") throw new Error("You are not registered for this session.")

  await db.sessionRegistration.update({
    where: { id: reg.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  })

  revalidatePath("/schedule")
}
