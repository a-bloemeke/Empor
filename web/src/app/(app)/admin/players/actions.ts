"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"

function revalidate() {
  revalidatePath("/admin/players")
}

export async function createGuest(firstName: string, lastName: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const fn = firstName.trim()
  const ln = lastName.trim()
  if (!fn) throw new Error("First name is required.")

  const uniqueTag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  await db.player.create({
    data: {
      email: `guest-${uniqueTag}@empor.guest`,
      firstName: fn,
      lastName: ln,
      role: "PLAYER",
    },
  })
  revalidate()
}

export async function createPlayer(data: {
  email: string
  firstName: string
  lastName: string
  password: string
}) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const email = data.email.trim().toLowerCase()
  const fn = data.firstName.trim()
  const ln = data.lastName.trim()
  if (!email || !fn || !ln) throw new Error("Email, first name and last name are required.")
  if (data.password.length < 8) throw new Error("Password must be at least 8 characters.")

  const existing = await db.player.findUnique({ where: { email } })
  if (existing) throw new Error("Email is already in use.")

  const passwordHash = await bcrypt.hash(data.password, 12)
  await db.player.create({ data: { email, firstName: fn, lastName: ln, passwordHash, role: "PLAYER" } })
  revalidate()
}

export async function deletePlayer(playerId: string) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")
  if (authSession.user.id === playerId) throw new Error("You cannot delete your own account.")

  // Check for any played matches (goals scored or assisted)
  const goalCount = await db.goal.count({
    where: { OR: [{ scoredByPlayerId: playerId }, { assistedByPlayerId: playerId }] },
  })
  if (goalCount > 0) throw new Error("Cannot delete a player who has scored goals or assists. Remove their stats first via data export/import.")

  await db.player.delete({ where: { id: playerId } })
  revalidate()
}
