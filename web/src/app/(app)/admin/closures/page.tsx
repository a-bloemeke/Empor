import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { ClosuresClient } from "./closures-client"

export default async function ClosuresPage() {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") redirect("/schedule")

  const closures = await db.hallClosure.findMany({
    orderBy: { startDate: "asc" },
  })

  return (
    <ClosuresClient
      closures={closures.map((c) => ({
        id: c.id,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate.toISOString(),
        reason: c.reason,
      }))}
    />
  )
}
