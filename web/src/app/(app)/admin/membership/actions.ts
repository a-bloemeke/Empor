"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function setFeeStatus(playerId: string, year: number, status: "PAID" | "NOT_PAID") {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  await db.membershipFee.upsert({
    where: { playerId_year: { playerId, year } },
    create: {
      playerId,
      year,
      status,
      paidAt: status === "PAID" ? new Date() : null,
      recordedById: authSession.user.id,
    },
    update: {
      status,
      paidAt: status === "PAID" ? new Date() : null,
      recordedById: authSession.user.id,
    },
  })

  revalidatePath("/admin/membership")
}
