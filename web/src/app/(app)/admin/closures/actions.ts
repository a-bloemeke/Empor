"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function createHallClosure(startDate: string, endDate: string, reason?: string) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const start = new Date(startDate + "T00:00:00.000Z")
  const end = new Date(endDate + "T00:00:00.000Z")
  if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error("Ungültiges Datum.")
  if (end < start) throw new Error("Enddatum muss nach Startdatum liegen.")

  await db.hallClosure.create({
    data: { startDate: start, endDate: end, reason: reason?.trim() || null },
  })

  revalidatePath("/admin/closures")
  revalidatePath("/schedule")
}

export async function updateHallClosure(id: string, startDate: string, endDate: string, reason?: string) {
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

  revalidatePath("/admin/closures")
  revalidatePath("/schedule")
}

export async function deleteHallClosure(id: string) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  await db.hallClosure.delete({ where: { id } })

  revalidatePath("/admin/closures")
  revalidatePath("/schedule")
}
