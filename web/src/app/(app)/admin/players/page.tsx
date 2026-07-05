import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { PlayersClient } from "./players-client"
import { buildPlayerNames } from "@/lib/player-names"

export default async function AdminPlayersPage() {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") redirect("/schedule")

  const players = await db.player.findMany({
    select: { id: true, firstName: true, lastName: true, nickname: true, email: true, role: true, emailNotifications: true, active: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })

  const displayNames = buildPlayerNames(players)

  return (
    <PlayersClient
      players={players.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        displayName: displayNames.get(p.id) ?? p.firstName,
        email: p.email,
        role: p.role as string,
        isGuest: p.email.endsWith("@empor.guest"),
        emailNotifications: p.emailNotifications,
        active: p.active,
      }))}
    />
  )
}
