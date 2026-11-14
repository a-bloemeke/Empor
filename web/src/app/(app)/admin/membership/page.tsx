import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { MembershipClient } from "./membership-client"
import { buildPlayerNames } from "@/lib/player-names"

export default async function MembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const authSession = await auth()
  if (authSession?.user?.role !== "ORGANIZER") redirect("/schedule")

  const currentYear = new Date().getFullYear()
  const { year: yearParam } = await searchParams
  const year = yearParam ? parseInt(yearParam) : currentYear + 1

  const [fees, allActive, campaign] = await Promise.all([
    db.membershipFee.findMany({
      where: { year },
      include: {
        player: { select: { id: true, firstName: true, lastName: true, nickname: true } },
      },
    }),
    db.player.findMany({
      where: { active: true, passwordHash: { not: null } },
      select: { id: true, firstName: true, lastName: true, nickname: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.membershipCampaign.findUnique({ where: { year } }),
  ])

  const rosteredIds = new Set(fees.map((f) => f.playerId))
  const availablePlayers = allActive.filter((p) => !rosteredIds.has(p.id))

  const rosteredPlayers = fees.map((f) => f.player)
  const displayNames = buildPlayerNames([...rosteredPlayers, ...availablePlayers])

  const players = fees
    .map((f) => ({
      id: f.playerId,
      name: displayNames.get(f.playerId) ?? f.player.firstName,
      status: f.status as string,
      paidAt: f.paidAt?.toISOString() ?? null,
      playerIntent: f.playerIntent as string | null,
      intentAt: f.intentAt?.toISOString() ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const availableToAdd = availablePlayers.map((p) => ({
    id: p.id,
    name: displayNames.get(p.id) ?? p.firstName,
  }))

  return (
    <MembershipClient
      players={players}
      availableToAdd={availableToAdd}
      year={year}
      defaultYear={currentYear}
      campaign={campaign ? {
        year: campaign.year,
        amount: campaign.amount,
        bankName: campaign.bankName,
        iban: campaign.iban,
        bic: campaign.bic,
        paypalHandle: campaign.paypalHandle,
        status: campaign.status as string,
        lastInvitationSentAt: campaign.lastInvitationSentAt?.toISOString() ?? null,
      } : null}
    />
  )
}

