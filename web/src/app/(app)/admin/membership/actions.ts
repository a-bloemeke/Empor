"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { sendMembershipInvitationEmail } from "@/lib/email"

function revalidate() {
  revalidatePath("/admin/membership")
}

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

  revalidate()
}

export async function addPlayersToYear(playerIds: string[], year: number) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")
  if (playerIds.length === 0) return

  await db.membershipFee.createMany({
    data: playerIds.map((playerId) => ({
      playerId,
      year,
      status: "NOT_PAID" as const,
      recordedById: authSession.user.id,
    })),
    skipDuplicates: true,
  })

  revalidate()
}

export async function removePlayerFromYear(playerId: string, year: number) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  await db.membershipFee.delete({
    where: { playerId_year: { playerId, year } },
  })

  revalidate()
}

export async function createCampaign(data: {
  year: number
  amount: number
  bankName?: string
  iban?: string
  bic?: string
  paypalHandle?: string
}): Promise<{ ok: true } | { error: string }> {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") return { error: "Nicht autorisiert." }

  if (!data.year || data.amount <= 0) return { error: "Ungültige Kampagnendaten." }

  try {
    await db.membershipCampaign.create({
      data: {
        year: data.year,
        amount: data.amount,
        bankName: data.bankName?.trim() || null,
        iban: data.iban?.trim().replace(/\s/g, "") || null,
        bic: data.bic?.trim() || null,
        paypalHandle: data.paypalHandle?.trim() || null,
      },
    })
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") return { error: "Für dieses Jahr existiert bereits eine Kampagne." }
    throw e
  }

  revalidate()
  return { ok: true }
}

export async function closeCampaign(year: number): Promise<{ ok: true } | { error: string }> {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") return { error: "Nicht autorisiert." }

  const campaign = await db.membershipCampaign.findUnique({ where: { year } })
  if (!campaign) return { error: "Kampagne nicht gefunden." }
  if (campaign.status !== "ACTIVE") return { error: "Kampagne ist bereits geschlossen." }

  await db.membershipCampaign.update({ where: { year }, data: { status: "CLOSED" } })
  revalidate()
  return { ok: true }
}

export async function reopenCampaign(year: number): Promise<{ ok: true } | { error: string }> {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") return { error: "Nicht autorisiert." }

  const campaign = await db.membershipCampaign.findUnique({ where: { year } })
  if (!campaign) return { error: "Kampagne nicht gefunden." }
  if (campaign.status !== "CLOSED") return { error: "Kampagne ist bereits aktiv." }

  await db.membershipCampaign.update({ where: { year }, data: { status: "ACTIVE" } })
  revalidate()
  return { ok: true }
}

export async function deleteCampaign(year: number): Promise<{ ok: true; removedFees: number } | { error: string }> {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") return { error: "Nicht autorisiert." }

  const campaign = await db.membershipCampaign.findUnique({ where: { year } })
  if (!campaign) return { error: "Kampagne nicht gefunden." }

  const { count } = await db.membershipFee.deleteMany({ where: { year, status: "NOT_PAID" } })
  await db.membershipCampaign.delete({ where: { year } })
  revalidate()
  return { ok: true, removedFees: count }
}

export async function sendMembershipInvitation(year: number): Promise<{ ok: true; sent: number } | { error: string }> {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") return { error: "Nicht autorisiert." }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { error: "SMTP ist nicht konfiguriert." }
  }

  const campaign = await db.membershipCampaign.findUnique({ where: { year } })
  if (!campaign) return { error: "Kampagne nicht gefunden." }
  if (campaign.status !== "ACTIVE") return { error: "Die Kampagne ist bereits geschlossen." }

  const activePlayers = await db.player.findMany({
    where: { active: true, passwordHash: { not: null } },
    select: { id: true, email: true, firstName: true, emailNotifications: true },
  })

  // Upsert fee records for all active players
  await db.membershipFee.createMany({
    data: activePlayers.map((p) => ({
      playerId: p.id,
      year,
      status: "NOT_PAID" as const,
      recordedById: authSession.user.id,
    })),
    skipDuplicates: true,
  })

  const recipients = activePlayers.filter((p) => p.emailNotifications && p.email)

  if (recipients.length === 0) {
    return { error: "Keine Empfänger mit aktivierten E-Mail-Benachrichtigungen gefunden." }
  }

  try {
    const sent = await sendMembershipInvitationEmail(
      { year: campaign.year, amount: campaign.amount, bankName: campaign.bankName, iban: campaign.iban, bic: campaign.bic, paypalHandle: campaign.paypalHandle },
      recipients,
    )
    await db.membershipCampaign.update({ where: { year }, data: { lastInvitationSentAt: new Date() } })
    revalidate()
    return { ok: true, sent }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

