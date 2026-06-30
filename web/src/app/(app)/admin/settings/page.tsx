import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { SettingsClient } from "./settings-client"

export default async function SettingsPage() {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") redirect("/schedule")

  const emailFrom = await db.appConfig.findUnique({ where: { key: "emailFrom" } })

  return <SettingsClient emailFrom={emailFrom?.value ?? ""} />
}
