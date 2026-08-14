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
  const year = yearParam ? parseInt(yearParam) : currentYear

  // The roster for a year = players who have a MembershipFee record for that year
  const fees = await db.membershipFee.findMany({
    where: { year },
    include: {
      player: { select: { id: true, firstName: true, lastName: true, nickname: true } },
    },
  })
  const rosteredIds = new Set(fees.map((f) => f.playerId))

  // Active players not yet on this year's roster (shown in the Add dialog)
  const allActive = await db.player.findMany({
    where: { active: true, passwordHash: { not: null } },
    select: { id: true, firstName: true, lastName: true, nickname: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })
  const availablePlayers = allActive.filter((p) => !rosteredIds.has(p.id))

  // Build display names across both sets for consistent disambiguation
  const rosteredPlayers = fees.map((f) => f.player)
  const displayNames = buildPlayerNames([...rosteredPlayers, ...availablePlayers])

  const players = fees
    .map((f) => ({
      id: f.playerId,
      name: displayNames.get(f.playerId) ?? f.player.firstName,
      status: f.status as string,
      paidAt: f.paidAt?.toISOString() ?? null,
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
    />
  )
}
