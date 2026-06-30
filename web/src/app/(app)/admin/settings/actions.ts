"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function saveEmailFrom(email: string) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")

  const trimmed = email.trim()
  if (!trimmed) throw new Error("Email address cannot be empty.")

  await db.appConfig.upsert({
    where: { key: "emailFrom" },
    update: { value: trimmed },
    create: { key: "emailFrom", value: trimmed },
  })

  revalidatePath("/admin/settings")
}
