"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function submitMembershipIntent(
  year: number,
  intent: "CONFIRMED" | "DECLINED",
): Promise<{ ok: true } | { error: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Nicht angemeldet." }
  const playerId = session.user.id

  const player = await db.player.findUnique({ where: { id: playerId }, select: { passwordHash: true, active: true } })
  if (!player?.active) return { error: "Dein Konto ist derzeit inaktiv." }
  if (!player.passwordHash) return { error: "Gäste können keine Rückmeldung geben." }

  const fee = await db.membershipFee.findUnique({
    where: { playerId_year: { playerId, year } },
  })
  if (!fee) return { error: "Du bist nicht auf der Mitgliederliste für dieses Jahr." }

  const campaign = await db.membershipCampaign.findUnique({ where: { year } })
  if (!campaign || campaign.status !== "ACTIVE") {
    return { error: "Die Kampagne ist nicht mehr aktiv." }
  }

  await db.membershipFee.update({
    where: { playerId_year: { playerId, year } },
    data: { playerIntent: intent, intentAt: new Date() },
  })

  revalidatePath("/membership")
  revalidatePath("/admin/membership")
  return { ok: true }
}
