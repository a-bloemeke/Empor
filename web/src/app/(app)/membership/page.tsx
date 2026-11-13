import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { MembershipFeeClient } from "./membership-client"

export default async function MembershipPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const player = await db.player.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true, active: true },
  })
  if (!player?.passwordHash) redirect("/schedule")

  const campaign = await db.membershipCampaign.findFirst({
    where: { status: "ACTIVE" },
    select: { year: true, amount: true, bankName: true, iban: true, bic: true, paypalHandle: true },
  })

  if (!campaign) {
    return <MembershipFeeClient campaign={null} fee={null} />
  }

  const fee = await db.membershipFee.findUnique({
    where: { playerId_year: { playerId: session.user.id, year: campaign.year } },
    select: { status: true, playerIntent: true, intentAt: true },
  })

  return (
    <MembershipFeeClient
      campaign={campaign}
      fee={fee ? {
        status: fee.status as string,
        playerIntent: fee.playerIntent as string | null,
        intentAt: fee.intentAt?.toISOString() ?? null,
      } : null}
    />
  )
}
