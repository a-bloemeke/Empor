import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import nodemailer from "nodemailer"
import { format } from "date-fns"
import { de } from "date-fns/locale"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return NextResponse.json({ skipped: "SMTP not configured" })
  }

  const session = await db.session.findFirst({
    where: { status: "SCHEDULED", date: { gte: new Date() } },
    orderBy: { date: "asc" },
    include: {
      registrations: {
        where: { status: "MAYBE" },
        include: {
          player: { select: { id: true, firstName: true, email: true, emailNotifications: true } },
        },
      },
    },
  })

  if (!session) return NextResponse.json({ sent: 0, reason: "no upcoming session" })

  const recipients = session.registrations.filter(
    (r) => r.player.emailNotifications && r.player.email
  )

  if (recipients.length === 0) return NextResponse.json({ sent: 0 })

  const config = await db.appConfig.findUnique({ where: { key: "emailFrom" } })
  const from = config?.value ?? process.env.SMTP_USER!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"
  const dateStr = format(session.date, "EEEE, d. MMMM yyyy", { locale: de })
  const scheduleLink = `${appUrl}/schedule`

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? "465"),
    secure: (process.env.SMTP_PORT ?? "465") === "465",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })

  let sent = 0
  for (const reg of recipients) {
    const { firstName, email } = reg.player
    const subject = `❓ Bist du dabei? Spieltag am ${dateStr}`
    const text = `Hey ${firstName},\n\ndu hast dich für den Spieltag am ${dateStr} um 20:00 Uhr als "Vielleicht" eingetragen.\n\nBitte jetzt verbindlich zu- oder absagen:\n${scheduleLink}\n\nEmpor Lichtenberg`
    const html = `<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 8px">Hey ${firstName},</p>
  <p style="margin:0 0 16px">du hast dich für den Spieltag am <strong>${dateStr}</strong> um <strong>20:00 Uhr</strong> als <strong>„Vielleicht"</strong> eingetragen.</p>
  <p style="margin:0 0 24px">Bitte jetzt verbindlich zu- oder absagen:</p>
  <a href="${scheduleLink}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Spielplan ansehen →</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  <p style="margin:0;color:#888;font-size:12px">Empor Lichtenberg</p>
</body>
</html>`
    await transporter.sendMail({ from, to: email!, subject, text, html })
    sent++
  }

  return NextResponse.json({ sent })
}
