"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function startSeason(year: number) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Invalid year.")
  }

  const existing = await db.season.findUnique({ where: { year } })
  if (existing) throw new Error(`Season ${year} already exists.`)

  await db.season.create({ data: { year } })
  revalidatePath("/admin/seasons")
}

export async function closeSeason(seasonId: string) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const season = await db.season.findUnique({
    where: { id: seasonId },
    include: {
      _count: {
        select: {
          sessions: { where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } } },
        },
      },
    },
  })

  if (!season) throw new Error("Season not found.")
  if (season.status === "COMPLETED") throw new Error("Season is already closed.")
  if (season._count.sessions > 0) {
    throw new Error(
      `Cannot close: ${season._count.sessions} session(s) are still scheduled or in progress.`
    )
  }

  await db.season.update({ where: { id: seasonId }, data: { status: "COMPLETED" } })
  revalidatePath("/admin/seasons")
}

export async function reopenSeason(seasonId: string) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const season = await db.season.findUnique({ where: { id: seasonId } })
  if (!season) throw new Error("Season not found.")
  if (season.status === "ACTIVE") throw new Error("Season is already active.")

  await db.season.update({ where: { id: seasonId }, data: { status: "ACTIVE" } })
  revalidatePath("/admin/seasons")
}
