import { db } from "@/lib/db"
import { QuotesClient } from "./quotes-client"

export default async function QuotesPage() {
  const quotes = await db.quoteCollection.findMany({ orderBy: { author: "asc" } })
  return <QuotesClient quotes={quotes} />
}
