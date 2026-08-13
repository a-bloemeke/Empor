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

export async function sendStatusUpdateEmail(
  session: { id: string; date: Date },
  subject: string,
  plainTextBody: string,
  recipientEmails: string[],
  lists: {
    registered: string[]
    maybe: string[]
    cancelled: string[]
    noAnswer: string[]
  },
  delta?: {
    newRegistrations: string[]
    newCancellations: string[]
  },
) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP is not configured on this server.")
  }
  if (recipientEmails.length === 0) throw new Error("No recipients selected.")

  const config = await db.appConfig.findUnique({ where: { key: "emailFrom" } })
  const from = config?.value ?? process.env.SMTP_USER!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"
  const link = `${appUrl}/sessions/${session.id}`

  const introHtml = plainTextBody
    .split("\n\n")[0]
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>")

  const rowStyle = "padding:6px 12px;border-bottom:1px solid #e5e5e5;font-size:14px"
  const headerStyle = "padding:6px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#fff"

  function section(label: string, color: string, names: string[]) {
    if (names.length === 0) return ""
    const rows = names.map((n, i) =>
      `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
        <td style="${rowStyle};color:#666;width:28px;text-align:right">${i + 1}</td>
        <td style="${rowStyle}">${n.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>
      </tr>`
    ).join("")
    return `
<table style="border-collapse:collapse;width:100%;margin-bottom:16px;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5">
  <thead>
    <tr style="background:${color}">
      <th colspan="2" style="${headerStyle};text-align:left">${label} (${names.length})</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`
  }

  const tablesHtml = [
    section("✅ Zugesagt", "#166534", lists.registered),
    section("❓ Vielleicht", "#92400e", lists.maybe),
    section("❌ Abgesagt", "#991b1b", lists.cancelled),
    section("⏳ Noch keine Antwort", "#374151", lists.noAnswer),
  ].join("")

  const hasDelta = delta && (delta.newRegistrations.length > 0 || delta.newCancellations.length > 0)
  const deltaHtml = hasDelta
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:16px">
  <p style="margin:0 0 8px;font-weight:600;font-size:13px;color:#166534">Neu seit letztem Update</p>
  ${delta.newRegistrations.length > 0 ? `<p style="margin:0 0 4px;font-size:13px;color:#166534">✅ +${delta.newRegistrations.length} angemeldet: ${delta.newRegistrations.map(n => n.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join(", ")}</p>` : ""}
  ${delta.newCancellations.length > 0 ? `<p style="margin:0;font-size:13px;color:#991b1b">❌ −${delta.newCancellations.length} abgesagt: ${delta.newCancellations.map(n => n.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join(", ")}</p>` : ""}
</div>`
    : ""

  const html = `
<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="white-space:pre-line;margin:0 0 24px;line-height:1.6">${introHtml}</p>
  ${deltaHtml}
  ${tablesHtml}
  <a href="${link}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Spieltag ansehen →</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  <p style="margin:0;color:#888;font-size:12px">Empor Lichtenberg</p>
</body>
</html>`

  const transporter = createTransport()
  await transporter.sendMail({ from, to: recipientEmails, subject, text: plainTextBody, html })
  return recipientEmails.length
}

export async function sendGameDayCancellation(
  session: { id: string; date: Date },
  subject: string,
  plainTextBody: string,
  recipientEmails: string[],
) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP is not configured on this server.")
  }
  if (recipientEmails.length === 0) throw new Error("No recipients selected.")

  const config = await db.appConfig.findUnique({ where: { key: "emailFrom" } })
  const from = config?.value ?? process.env.SMTP_USER!

  const htmlBody = plainTextBody
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>")

  const html = `
<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="white-space:pre-line;margin:0 0 24px;line-height:1.6">${htmlBody}</p>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  <p style="margin:0;color:#888;font-size:12px">Empor Lichtenberg</p>
</body>
</html>`

  const transporter = createTransport()
  await transporter.sendMail({ from, to: recipientEmails, subject, text: plainTextBody, html })
  return recipientEmails.length
}

export async function notifyOrganizersCancellation(
  session: { id: string; date: Date },
  player: { firstName: string; lastName: string; email: string },
  wasRegistered: boolean,
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
  const name = `${player.firstName} ${player.lastName}`

  const subject = wasRegistered
    ? `Abmeldung: ${name} – ${dateStr}`
    : `Abgesagt (nie angemeldet): ${name} – ${dateStr}`

  const bodyText = wasRegistered
    ? `${name} hat sich vom Spieltag am ${dateStr} abgemeldet.\n\nDer Spieler war zuvor angemeldet.\n\n${link}`
    : `${name} hat für den Spieltag am ${dateStr} abgesagt, ohne vorher angemeldet zu sein.\n\n${link}`

  const bodyHtml = wasRegistered
    ? `<p style="margin:0 0 16px"><strong>${name}</strong> hat sich vom Spieltag am <strong>${dateStr}</strong> <span style="color:#991b1b">abgemeldet</span>.</p>
       <p style="margin:0 0 24px;color:#555">Der Spieler war zuvor angemeldet.</p>`
    : `<p style="margin:0 0 16px"><strong>${name}</strong> hat für den Spieltag am <strong>${dateStr}</strong> abgesagt, <span style="color:#92400e">ohne vorher angemeldet zu sein</span>.</p>`

  const html = `<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  ${bodyHtml}
  <a href="${link}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Spieltag ansehen →</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  <p style="margin:0;color:#888;font-size:12px">Empor Lichtenberg</p>
</body>
</html>`

  const transporter = createTransport()
  await transporter.sendMail({ from, to: organizers.map((o) => o.email), subject, text: bodyText, html })
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

export async function sendRsvpConfirmation(
  session: { id: string; date: Date },
  player: { email: string; firstName: string },
) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return
  if (!player.email) return

  const config = await db.appConfig.findUnique({ where: { key: "emailFrom" } })
  const from = config?.value ?? process.env.SMTP_USER!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"

  const dateStr = format(session.date, "EEEE, d. MMMM yyyy", { locale: de })
  const scheduleLink = `${appUrl}/schedule`

  const subject = `✅ Anmeldung bestätigt – ${dateStr}`
  const text = `Hey ${player.firstName},\n\ndeine Anmeldung für den Spieltag am ${dateStr} um 20:00 Uhr wurde bestätigt.\n\nUm abzusagen, besuche die Spielplan-Seite: ${scheduleLink}\n\nEmpor Lichtenberg`
  const html = `<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 8px">Hey ${player.firstName},</p>
  <p style="margin:0 0 16px">deine Anmeldung für den Spieltag am <strong>${dateStr}</strong> um <strong>20:00 Uhr</strong> wurde bestätigt. ✅</p>
  <a href="${scheduleLink}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Spielplan ansehen →</a>
  <p style="margin:24px 0 0;color:#555;font-size:13px">Um abzusagen, öffne den Spielplan und klicke auf "Absagen" neben dem Spieltag.</p>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  <p style="margin:0;color:#888;font-size:12px">Empor Lichtenberg</p>
</body>
</html>`

  const transporter = createTransport()
  await transporter.sendMail({ from, to: player.email, subject, text, html })
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

export async function sendWelcomeEmail(player: { email: string; firstName: string }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return
  if (!player.email) return

  const config = await db.appConfig.findUnique({ where: { key: "emailFrom" } })
  const from = config?.value ?? process.env.SMTP_USER!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"
  const loginLink = `${appUrl}/login`

  const subject = `Willkommen bei Empor! 🎉`
  const text = `Hey ${player.firstName},\n\ndein Konto bei Empor Lichtenberg ist jetzt aktiv. Du kannst dich ab sofort einloggen:\n${loginLink}\n\nEmpor Lichtenberg`
  const html = `<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 8px">Hey ${player.firstName},</p>
  <p style="margin:0 0 16px">dein Konto bei <strong>Empor Lichtenberg</strong> ist jetzt aktiv. Du kannst dich ab sofort einloggen und deine Anmeldungen selbst verwalten.</p>
  <a href="${loginLink}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Jetzt einloggen →</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  <p style="margin:0;color:#888;font-size:12px">Empor Lichtenberg</p>
</body>
</html>`

  const transporter = createTransport()
  await transporter.sendMail({ from, to: player.email, subject, text, html })
}


export async function sendWaitlistConfirmation(
  session: { id: string; date: Date },
  player: { email: string; firstName: string },
) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return
  if (!player.email) return

  const config = await db.appConfig.findUnique({ where: { key: "emailFrom" } })
  const from = config?.value ?? process.env.SMTP_USER!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"
  const dateStr = format(session.date, "EEEE, d. MMMM yyyy", { locale: de })
  const scheduleLink = `${appUrl}/schedule`

  const subject = `⏳ Warteliste – Spieltag ${dateStr}`
  const text = `Hey ${player.firstName},\n\nder Spieltag am ${dateStr} ist bereits voll. Du stehst jetzt auf der Warteliste und wirst automatisch angemeldet, wenn ein Platz frei wird.\n\n${scheduleLink}\n\nEmpor Lichtenberg`
  const html = `<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 8px">Hey ${player.firstName},</p>
  <p style="margin:0 0 16px">der Spieltag am <strong>${dateStr}</strong> ist bereits voll. Du stehst jetzt auf der <strong>Warteliste</strong> und wirst automatisch angemeldet, sobald ein Platz frei wird.</p>
  <a href="${scheduleLink}" style="display:inline-block;background:#1e40af;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Spielplan ansehen →</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  <p style="margin:0;color:#888;font-size:12px">Empor Lichtenberg</p>
</body>
</html>`

  const transporter = createTransport()
  await transporter.sendMail({ from, to: player.email, subject, text, html })
}

export async function sendWaitlistPromotion(
  session: { id: string; date: Date },
  player: { email: string; firstName: string },
) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return
  if (!player.email) return

  const config = await db.appConfig.findUnique({ where: { key: "emailFrom" } })
  const from = config?.value ?? process.env.SMTP_USER!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"
  const dateStr = format(session.date, "EEEE, d. MMMM yyyy", { locale: de })
  const scheduleLink = `${appUrl}/schedule`

  const subject = `✅ Platz frei! Spieltag ${dateStr}`
  const text = `Hey ${player.firstName},\n\nein Platz ist frei geworden! Du bist jetzt für den Spieltag am ${dateStr} angemeldet.\n\n${scheduleLink}\n\nEmpor Lichtenberg`
  const html = `<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 8px">Hey ${player.firstName},</p>
  <p style="margin:0 0 16px">🎉 Ein Platz ist frei geworden! Du bist jetzt für den Spieltag am <strong>${dateStr}</strong> angemeldet.</p>
  <a href="${scheduleLink}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Spielplan ansehen →</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  <p style="margin:0;color:#888;font-size:12px">Empor Lichtenberg</p>
</body>
</html>`

  const transporter = createTransport()
  await transporter.sendMail({ from, to: player.email, subject, text, html })
}
