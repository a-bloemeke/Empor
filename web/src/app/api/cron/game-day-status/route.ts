import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendStatusUpdateEmail } from "@/lib/email"
import { buildPlayerNames } from "@/lib/player-names"
import { format } from "date-fns"
import { de } from "date-fns/locale"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  // Verify this is called by Vercel cron (or authorized caller)
  const secret = req.headers.get("authorization")?.replace("Bearer ", "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return NextResponse.json({ skipped: "SMTP not configured" })
  }

  // Find the single next upcoming scheduled game day
  const session = await db.session.findFirst({
    where: { status: "SCHEDULED", date: { gte: new Date() } },
    orderBy: { date: "asc" },
    include: {
      registrations: {
        include: {
          player: { select: { id: true, firstName: true, lastName: true, nickname: true, passwordHash: true } },
        },
        orderBy: { registeredAt: "asc" },
      },
    },
  })

  if (!session) {
    return NextResponse.json({ skipped: "No upcoming scheduled game day" })
  }

  const MIN_PLAYERS = 8
  const allActivePlayers = await db.player.findMany({
    where: { passwordHash: { not: null }, active: true },
    select: { id: true, firstName: true, lastName: true, nickname: true, email: true, emailNotifications: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })

  const registered = session.registrations.filter((r) => r.status === "REGISTERED").map((r) => r.player)
  const cancelled = session.registrations.filter((r) => r.status === "CANCELLED").map((r) => r.player)
  const respondedIds = new Set(session.registrations.map((r) => r.playerId))
  const noAnswer = allActivePlayers.filter((p) => !respondedIds.has(p.id))

  const count = registered.length
  const hoursUntil = (session.date.getTime() - Date.now()) / (1000 * 60 * 60)
  const enough = count >= MIN_PLAYERS
  const critical = !enough && hoursUntil <= 32
  const trafficLight = enough ? "🟢" : critical ? "🔴" : "🟡"
  const statusText = enough
    ? "Der Spieltag findet voraussichtlich statt! 🎉"
    : critical
    ? "Leider zu wenig Spieler – der Spieltag droht auszufallen. Bitte meldet euch an!"
    : "Wir brauchen noch ein paar Spieler – bitte meldet euch an!"

  const displayNames = buildPlayerNames(allActivePlayers)
  const dname = (p: { id: string }) => displayNames.get(p.id) ?? p.id

  const dateStr = format(session.date, "EEEE, d. MMMM yyyy", { locale: de })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"
  const link = `${appUrl}/sessions/${session.id}`

  const subject = `${trafficLight} Spieltag ${dateStr} – ${count} von ${MIN_PLAYERS} Spielern`

  const registeredList = registered.map(dname).join(", ") || "– noch niemand –"
  const cancelledList = cancelled.map(dname).join(", ")
  const noAnswerList = noAnswer.map(dname).join(", ")

  const body = `Hey Kicker,

kurzes Update zum Spieltag am ${dateStr}:

${trafficLight} Aktuell ${count} von mindestens ${MIN_PLAYERS} Spielern angemeldet.
${statusText}

✅ Zugesagt (${count}):
${registeredList}
${cancelledList ? `\n❌ Abgesagt (${cancelled.length}):\n${cancelledList}\n` : ""}${noAnswerList ? `\n⏳ Noch keine Antwort (${noAnswer.length}):\n${noAnswerList}\n` : ""}
${link}

Empor Lichtenberg`

  // Send to all active players with email notifications enabled
  const recipients = allActivePlayers.filter((p) => p.emailNotifications).map((p) => p.email)
  if (recipients.length === 0) {
    return NextResponse.json({ skipped: "No recipients with email notifications" })
  }

  await sendStatusUpdateEmail(
    { id: session.id, date: session.date },
    subject,
    body,
    recipients,
    {
      registered: registered.map(dname),
      cancelled: cancelled.map(dname),
      noAnswer: noAnswer.map(dname),
    },
  )

  return NextResponse.json({ ok: true, sessionId: session.id, recipients: recipients.length })
}
