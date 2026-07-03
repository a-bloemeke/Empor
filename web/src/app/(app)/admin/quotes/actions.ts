"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function deleteQuote(id: string) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")
  await db.quoteCollection.delete({ where: { id } })
  revalidatePath("/admin/quotes")
}

export async function addQuote(quote: string, author: string) {
  const session = await auth()
  if (session?.user?.role !== "ORGANIZER") throw new Error("Unauthorized")
  if (!quote.trim() || !author.trim()) throw new Error("Quote and author are required.")
  await db.quoteCollection.create({ data: { quote: quote.trim(), author: author.trim() } })
  revalidatePath("/admin/quotes")
}
