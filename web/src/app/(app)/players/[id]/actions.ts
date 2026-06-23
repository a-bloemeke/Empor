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
  data: { newPassword: string },
) {
  const authSession = await auth()
  if (!authSession?.user?.id) throw new Error("Unauthorized")
  if (authSession.user.id !== playerId && authSession.user.role !== "ORGANIZER") {
    throw new Error("Unauthorized")
  }

  if (data.newPassword.length < 8) throw new Error("Password must be at least 8 characters.")

  const hash = await bcrypt.hash(data.newPassword, 12)
  await db.player.update({ where: { id: playerId }, data: { passwordHash: hash } })

  revalidatePath(`/players/${playerId}`)
}
