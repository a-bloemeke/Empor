"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"

export async function updateProfile(
  playerId: string,
  data: {
    firstName: string
    lastName: string
    nickname: string
    dateOfBirth: string
    addressStreet: string
    addressCity: string
    addressPostalCode: string
  },
) {
  const authSession = await auth()
  if (!authSession?.user?.id) throw new Error("Unauthorized")
  if (authSession.user.id !== playerId && authSession.user.role !== "ORGANIZER") {
    throw new Error("Unauthorized")
  }

  await db.player.update({
    where: { id: playerId },
    data: {
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      nickname: data.nickname.trim() || null,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      addressStreet: data.addressStreet.trim() || null,
      addressCity: data.addressCity.trim() || null,
      addressPostalCode: data.addressPostalCode.trim() || null,
    },
  })

  revalidatePath(`/players/${playerId}`)
}

export async function updateProfileAdmin(
  playerId: string,
  data: { email: string; role: string },
) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const email = data.email.trim().toLowerCase()
  if (!email) throw new Error("Email is required.")

  const existing = await db.player.findFirst({ where: { email, NOT: { id: playerId } } })
  if (existing) throw new Error("Email is already in use by another player.")

  await db.player.update({
    where: { id: playerId },
    data: { email, role: data.role as any },
  })

  revalidatePath(`/players/${playerId}`)
}

export async function changePassword(
  playerId: string,
  data: { newPassword: string; currentPassword?: string },
) {
  const authSession = await auth()
  if (!authSession?.user?.id) throw new Error("Unauthorized")
  if (authSession.user.id !== playerId && authSession.user.role !== "ORGANIZER") {
    throw new Error("Unauthorized")
  }

  if (data.newPassword.length < 8) throw new Error("Password must be at least 8 characters.")
  if (data.newPassword.length > 128) throw new Error("Password too long.")

  // Players changing their own password must confirm the current one
  const isOwnAccount = authSession.user.id === playerId && authSession.user.role !== "ORGANIZER"
  if (isOwnAccount) {
    if (!data.currentPassword) throw new Error("Current password is required.")
    const player = await db.player.findUnique({ where: { id: playerId }, select: { passwordHash: true } })
    if (!player?.passwordHash) throw new Error("No password set on this account.")
    const valid = await bcrypt.compare(data.currentPassword, player.passwordHash)
    if (!valid) throw new Error("Current password is incorrect.")
  }

  const hash = await bcrypt.hash(data.newPassword, 12)
  await db.player.update({ where: { id: playerId }, data: { passwordHash: hash } })

  revalidatePath(`/players/${playerId}`)
}

export async function createAbsence(
  playerId: string,
  startIso: string,
  endIso: string,
  reason?: string,
) {
  const authSession = await auth()
  if (!authSession?.user?.id) throw new Error("Unauthorized")
  if (authSession.user.id !== playerId && authSession.user.role !== "ORGANIZER") {
    throw new Error("Unauthorized")
  }

  const startDate = new Date(startIso)
  const endDate = new Date(endIso)
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) throw new Error("Invalid dates.")
  if (endDate < startDate) throw new Error("End date must be on or after start date.")

  await db.playerAbsence.create({
    data: { playerId, startDate, endDate, reason: reason || null },
  })

  revalidatePath(`/players/${playerId}`)
}

export async function deleteAbsence(absenceId: string, playerId: string) {
  const authSession = await auth()
  if (!authSession?.user?.id) throw new Error("Unauthorized")
  if (authSession.user.id !== playerId && authSession.user.role !== "ORGANIZER") {
    throw new Error("Unauthorized")
  }

  const absence = await db.playerAbsence.findUnique({ where: { id: absenceId } })
  if (!absence || absence.playerId !== playerId) throw new Error("Absence not found.")

  await db.playerAbsence.delete({ where: { id: absenceId } })

  revalidatePath(`/players/${playerId}`)
}
