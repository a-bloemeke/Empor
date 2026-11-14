import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendMembershipReminderEmail } from "@/lib/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return NextResponse.json({ skipped: "SMTP not configured" })
  }

  const campaign = await db.membershipCampaign.findFirst({ where: { status: "ACTIVE" } })
  if (!campaign) {
    return NextResponse.json({ skipped: "No active campaign" })
  }

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000)

  const pendingFees = await db.membershipFee.findMany({
    where: {
      year: campaign.year,
      playerIntent: null,
      OR: [{ reminderLastSentAt: null }, { reminderLastSentAt: { lt: cutoff } }],
    },
    include: {
      player: { select: { id: true, email: true, firstName: true, emailNotifications: true, passwordHash: true, active: true } },
    },
  })

  const eligible = pendingFees.filter(
    (f) => f.player.active && f.player.passwordHash !== null && f.player.emailNotifications && f.player.email,
  )

  if (eligible.length === 0) {
    return NextResponse.json({ skipped: "No eligible recipients", campaignYear: campaign.year })
  }

  const recipients = eligible.map((f) => ({
    id: f.player.id,
    email: f.player.email,
    firstName: f.player.firstName,
  }))

  await sendMembershipReminderEmail(
    { year: campaign.year, amount: campaign.amount, bankName: campaign.bankName, iban: campaign.iban, bic: campaign.bic, paypalHandle: campaign.paypalHandle },
    recipients,
  )

  await db.membershipFee.updateMany({
    where: { id: { in: eligible.map((f) => f.id) } },
    data: { reminderLastSentAt: new Date() },
  })

  return NextResponse.json({ ok: true, sent: eligible.length, campaignYear: campaign.year })
}
