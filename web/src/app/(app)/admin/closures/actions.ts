"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { sendHallClosureConflictEmail } from "@/lib/email"

async function checkAndNotifyConflicts(
  start: Date,
  end: Date,
  reason: string | null | undefined,
  excludeClosureId?: string,
) {
  const conflicts = await db.session.findMany({
    where: { status: "SCHEDULED", date: { gte: start, lte: end } },
    select: { id: true, date: true },
    orderBy: { date: "asc" },
  })

  if (conflicts.length > 0) {
    const organizers = await db.player.findMany({
      where: { role: "ORGANIZER", active: true, passwordHash: { not: null } },
      select: { email: true },
    })
    const emails = organizers.map((o) => o.email).filter(Boolean) as string[]
    await sendHallClosureConflictEmail({ startDate: start, endDate: end, reason }, conflicts, emails)
  }

  return conflicts.map((s) => s.date.toISOString())
}

export async function createHallClosure(
  startDate: string,
  endDate: string,
  reason?: string,
): Promise<{ conflictDates: string[] }> {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const start = new Date(startDate + "T00:00:00.000Z")
  const end = new Date(endDate + "T00:00:00.000Z")
  if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error("Ungültiges Datum.")
  if (end < start) throw new Error("Enddatum muss nach Startdatum liegen.")

  await db.hallClosure.create({
    data: { startDate: start, endDate: end, reason: reason?.trim() || null },
  })

  const conflictDates = await checkAndNotifyConflicts(start, end, reason?.trim() || null)

  revalidatePath("/admin/closures")
  revalidatePath("/schedule")
  return { conflictDates }
}

export async function updateHallClosure(
  id: string,
  startDate: string,
  endDate: string,
  reason?: string,
): Promise<{ conflictDates: string[] }> {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const start = new Date(startDate + "T00:00:00.000Z")
  const end = new Date(endDate + "T00:00:00.000Z")
  if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error("Ungültiges Datum.")
  if (end < start) throw new Error("Enddatum muss nach Startdatum liegen.")

  await db.hallClosure.update({
    where: { id },
    data: { startDate: start, endDate: end, reason: reason?.trim() || null },
  })

  const conflictDates = await checkAndNotifyConflicts(start, end, reason?.trim() || null, id)

  revalidatePath("/admin/closures")
  revalidatePath("/schedule")
  return { conflictDates }
}

export async function deleteHallClosure(id: string) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  await db.hallClosure.delete({ where: { id } })

  revalidatePath("/admin/closures")
  revalidatePath("/schedule")
}
