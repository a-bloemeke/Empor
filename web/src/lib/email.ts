import nodemailer from "nodemailer"
import { db } from "@/lib/db"
import { format } from "date-fns"
import { de } from "date-fns/locale"

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? "465"),
    secure: (process.env.SMTP_PORT ?? "465") === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

export function buildDefaultInvitation(session: { id: string; date: Date }): { subject: string; body: string } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"
  const dateStr = format(session.date, "EEEE, d. MMMM yyyy", { locale: de })
  const link = `${appUrl}/sessions/${session.id}`

  const subject = `📅 Neuer Spieltag – ${dateStr} · 20:00 Uhr`
  const body = `Hey Kicker,

ein neuer Spieltag wurde angelegt. Wenn du kommen kannst / willst, dann registriere dich auf unserer Webseite.

Datum: ${dateStr}
Uhrzeit: 20:00 Uhr

${link}

Empor Lichtenberg`

  return { subject, body }
}

export async function sendGameDayInvitation(
  session: { id: string; date: Date },
  subject: string,
  plainTextBody: string,
  recipientEmails: string[],
  quote?: { text: string; author: string },
) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP is not configured on this server.")
  }
  if (recipientEmails.length === 0) throw new Error("No recipients selected.")

  const config = await db.appConfig.findUnique({ where: { key: "emailFrom" } })
  const from = config?.value ?? process.env.SMTP_USER!

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"
  const link = `${appUrl}/sessions/${session.id}`

  const htmlBody = plainTextBody
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>")

  const quoteHtml = quote?.text
    ? `<hr style="margin:24px 0;border:none;border-top:1px solid #e5e5e5"/>
<blockquote style="margin:0;padding:0 0 0 16px;border-left:3px solid #166534;color:#444;font-style:italic">
  <p style="margin:0 0 6px">"${quote.text}"</p>
  <footer style="font-size:12px;color:#888">— ${quote.author}</footer>
</blockquote>`
    : ""

  const quotePlain = quote?.text ? `\n\n"${quote.text}"\n— ${quote.author}` : ""

  const transporter = createTransport()
  await transporter.sendMail({
    from,
    to: recipientEmails,
    subject,
    text: plainTextBody + quotePlain,
    html: `
<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="white-space:pre-line;margin:0 0 24px;line-height:1.6">${htmlBody}</p>
  <a href="${link}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">
    Jetzt anmelden →
  </a>
  ${quoteHtml}
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  <p style="margin:0;color:#888;font-size:12px">Empor Lichtenberg</p>
</body>
</html>`,
  })

  if (quote?.text && quote?.author) {
    await db.invitationQuote.create({
      data: { quote: quote.text, author: quote.author },
    })
  }

  return recipientEmails.length
}

export async function notifyOrganizersNewPlayer(player: { firstName: string; lastName: string; email: string }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return

  const organizers = await db.player.findMany({
    where: { role: "ORGANIZER", emailNotifications: true },
    select: { email: true },
  })
  if (organizers.length === 0) return

  const config = await db.appConfig.findUnique({ where: { key: "emailFrom" } })
  const from = config?.value ?? process.env.SMTP_USER!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"

  const subject = `Neue Registrierung: ${player.firstName} ${player.lastName}`
  const text = `Ein neuer Spieler hat sich registriert.\n\nName: ${player.firstName} ${player.lastName}\nE-Mail: ${player.email}\n\nSpieler verwalten: ${appUrl}/admin/players`
  const html = `
<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 16px">Ein neuer Spieler hat sich registriert.</p>
  <table style="border-collapse:collapse;margin-bottom:24px">
    <tr><td style="padding:4px 16px 4px 0;color:#555">Name</td><td><strong>${player.firstName} ${player.lastName}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#555">E-Mail</td><td>${player.email}</td></tr>
  </table>
  <a href="${appUrl}/admin/players" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Spieler verwalten →</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  <p style="margin:0;color:#888;font-size:12px">Empor Lichtenberg</p>
</body>
</html>`

  const transporter = createTransport()
  await transporter.sendMail({ from, to: organizers.map((o) => o.email), subject, text, html })
}

export async function notifyOrganizersSessionRegistration(
  session: { id: string; date: Date },
  player: { firstName: string; lastName: string; email: string },
) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return

  const organizers = await db.player.findMany({
    where: { role: "ORGANIZER", emailNotifications: true },
    select: { email: true },
  })
  if (organizers.length === 0) return

  const config = await db.appConfig.findUnique({ where: { key: "emailFrom" } })
  const from = config?.value ?? process.env.SMTP_USER!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"

  const dateStr = format(session.date, "EEEE, d. MMMM yyyy", { locale: de })
  const link = `${appUrl}/sessions/${session.id}`

  const subject = `Anmeldung: ${player.firstName} ${player.lastName} – ${dateStr}`
  const text = `${player.firstName} ${player.lastName} hat sich für den Spieltag am ${dateStr} angemeldet.\n\n${link}`
  const html = `
<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 16px"><strong>${player.firstName} ${player.lastName}</strong> hat sich für den Spieltag am <strong>${dateStr}</strong> angemeldet.</p>
  <a href="${link}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Spieltag ansehen →</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  <p style="margin:0;color:#888;font-size:12px">Empor Lichtenberg</p>
</body>
</html>`

  const transporter = createTransport()
  await transporter.sendMail({ from, to: organizers.map((o) => o.email), subject, text, html })
}

