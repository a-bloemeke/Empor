import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { PlayersClient } from "./players-client"

export default async function AdminPlayersPage() {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") redirect("/schedule")

  const players = await db.player.findMany({
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })

  return (
    <PlayersClient
      players={players.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        role: p.role as string,
        isGuest: p.email.endsWith("@empor.guest"),
      }))}
    />
  )
}
