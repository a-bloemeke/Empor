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

  const players = await db.player.findMany({
    where: { active: true, passwordHash: { not: null } },
    select: { id: true, firstName: true, lastName: true, nickname: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })

  const fees = await db.membershipFee.findMany({
    where: { year },
    select: { playerId: true, status: true, paidAt: true },
  })
  const feeMap = new Map(fees.map((f) => [f.playerId, f]))
  const displayNames = buildPlayerNames(players)

  return (
    <MembershipClient
      players={players.map((p) => ({
        id: p.id,
        name: displayNames.get(p.id) ?? p.firstName,
        status: (feeMap.get(p.id)?.status as string | undefined) ?? "NOT_PAID",
        paidAt: feeMap.get(p.id)?.paidAt?.toISOString() ?? null,
      }))}
      year={year}
      defaultYear={currentYear}
    />
  )
}
