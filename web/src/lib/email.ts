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

async function getOrganizerSignOff(): Promise<{ plain: string; html: string }> {
  const organizers = await db.player.findMany({
    where: { role: "ORGANIZER", active: true },
    select: { firstName: true },
    orderBy: { firstName: "asc" },
  })
  const names = organizers.map((o) => o.firstName).join(", ")
  const plain = names ? `Grüße vom aktuellen Orga-Team\n${names}` : "Grüße vom aktuellen Orga-Team"
  const html = names
    ? `<p style="margin:0;color:#888;font-size:12px">Grüße vom aktuellen Orga-Team<br/><strong>${names}</strong></p>`
    : `<p style="margin:0;color:#888;font-size:12px">Grüße vom aktuellen Orga-Team</p>`
  return { plain, html }
}

async function buildPlayerStatsMap(playerIds: string[]): Promise<Map<string, { goals: number }>> {
  if (playerIds.length === 0) return new Map()
  const activeSeason = await db.season.findFirst({ where: { status: "ACTIVE" }, select: { id: true } })
  if (!activeSeason) return new Map()
  const stats = await db.playerStats.findMany({
    where: { playerId: { in: playerIds }, seasonId: activeSeason.id },
    select: { playerId: true, goals: true },
  })
  return new Map(stats.map((s) => [s.playerId, { goals: s.goals }]))
}

function stripLegacySignOff(body: string): string {
  return body.replace(/\n+Empor Lichtenberg\s*$/, "").trimEnd()
}

export function buildDefaultInvitation(session: { id: string; date: Date }): { subject: string; body: string } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"
  const dateStr = format(session.date, "EEEE, d. MMMM yyyy", { locale: de })
  const link = `${appUrl}/sessions/${session.id}`

  const subject = `📅 Neuer Spieltag – ${dateStr} · 20:00 Uhr`
  const body = `Ein neuer Spieltag wurde angelegt. Wenn du kommen kannst / willst, dann registriere dich auf unserer Webseite.

Datum: ${dateStr}
Uhrzeit: 20:00 Uhr

${link}`

  return { subject, body }
}

export async function sendGameDayInvitation(
  session: { id: string; date: Date },
  subject: string,
  plainTextBody: string,
  recipients: { email: string; firstName: string; id: string }[],
  quote?: { text: string; author: string },
) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP is not configured on this server.")
  }
  if (recipients.length === 0) throw new Error("No recipients selected.")

  const config = await db.appConfig.findUnique({ where: { key: "emailFrom" } })
  const from = config?.value ?? process.env.SMTP_USER!

  const signOff = await getOrganizerSignOff()
  const statsMap = await buildPlayerStatsMap(recipients.map((r) => r.id))

  const strippedBody = stripLegacySignOff(plainTextBody).replace(/^Hey Kicker,\s*\n+/, "").trimStart()

  const quoteHtml = quote?.text
    ? `<hr style="margin:24px 0;border:none;border-top:1px solid #e5e5e5"/>
<blockquote style="margin:0;padding:0 0 0 16px;border-left:3px solid #166534;color:#444;font-style:italic">
  <p style="margin:0 0 6px">"${quote.text}"</p>
  <footer style="font-size:12px;color:#888">— ${quote.author}</footer>
</blockquote>`
    : ""
  const quotePlain = quote?.text ? `\n\n"${quote.text}"\n— ${quote.author}` : ""

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"
  const link = `${appUrl}/sessions/${session.id}`

  const transporter = createTransport()

  for (const recipient of recipients) {
    const stats = statsMap.get(recipient.id)
    const statsHtml =
      stats && stats.goals > 0
        ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin:16px 0;font-size:13px;color:#166534">⚽ Du hast diese Saison schon <strong>${stats.goals} Tor${stats.goals !== 1 ? "e" : ""}</strong> erzielt – bleib am Ball!</div>`
        : ""
    const statsPlain =
      stats && stats.goals > 0
        ? `\n\n⚽ Du hast diese Saison schon ${stats.goals} Tor${stats.goals !== 1 ? "e" : ""} erzielt – bleib am Ball!`
        : ""

    const bodyHtml = strippedBody
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>")

    const fullPlain = `Hey ${recipient.firstName},\n\n${strippedBody}${statsPlain}${quotePlain}\n\n${signOff.plain}`

    const html = `
<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 8px">Hey ${recipient.firstName},</p>
  <p style="white-space:pre-line;margin:0 0 24px;line-height:1.6">${bodyHtml}</p>
  <a href="${link}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">
    Jetzt anmelden →
  </a>
  ${statsHtml}
  ${quoteHtml}
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  ${signOff.html}
</body>
</html>`

    await transporter.sendMail({ from, to: recipient.email, subject, text: fullPlain, html })
  }

  if (quote?.text && quote?.author) {
    await db.invitationQuote.create({
      data: { quote: quote.text, author: quote.author },
    })
  }

  return recipients.length
}

export async function sendStatusUpdateEmail(
  session: { id: string; date: Date },
  subject: string,
  plainTextBody: string,
  recipients: { email: string; firstName: string; id: string; status: "REGISTERED" | "MAYBE" | "CANCELLED" | "NO_ANSWER" }[],
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
  if (recipients.length === 0) throw new Error("No recipients selected.")

  const config = await db.appConfig.findUnique({ where: { key: "emailFrom" } })
  const from = config?.value ?? process.env.SMTP_USER!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"
  const link = `${appUrl}/sessions/${session.id}`
  const dateStr = format(session.date, "EEEE, d. MMMM yyyy", { locale: de })

  const signOff = await getOrganizerSignOff()

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

  const statusBadgeConfig = {
    REGISTERED: { icon: "✅", text: "Angemeldet", color: "#166534", bg: "#f0fdf4", border: "#bbf7d0" },
    MAYBE: { icon: "❓", text: "Vielleicht", color: "#92400e", bg: "#fffbeb", border: "#fde68a" },
    CANCELLED: { icon: "❌", text: "Abgesagt", color: "#991b1b", bg: "#fef2f2", border: "#fecaca" },
    NO_ANSWER: { icon: "⏳", text: "Noch keine Antwort", color: "#374151", bg: "#f9fafb", border: "#e5e7eb" },
  }

  const introHtml = plainTextBody
    .split("\n\n")[0]
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>")

  const transporter = createTransport()

  for (const recipient of recipients) {
    const badge = statusBadgeConfig[recipient.status]
    const personalSubject =
      recipient.status === "NO_ANSWER"
        ? `⏳ Noch nicht angemeldet – Spieltag ${dateStr}`
        : subject

    const statusBadgeHtml = `<div style="background:${badge.bg};border:1px solid ${badge.border};border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:14px;color:${badge.color}"><strong>Dein Status: ${badge.icon} ${badge.text}</strong></div>`
    const statusPlain = `Dein Status: ${badge.icon} ${badge.text}`

    const html = `
<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 8px">Hey ${recipient.firstName},</p>
  <p style="white-space:pre-line;margin:0 0 16px;line-height:1.6">${introHtml}</p>
  ${statusBadgeHtml}
  ${deltaHtml}
  ${tablesHtml}
  <a href="${link}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Spieltag ansehen →</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  ${signOff.html}
</body>
</html>`

    const fullPlain = `Hey ${recipient.firstName},\n\n${plainTextBody}\n\n${statusPlain}\n\n${signOff.plain}`

    await transporter.sendMail({ from, to: recipient.email, subject: personalSubject, text: fullPlain, html })
  }

  return recipients.length
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

  const signOff = await getOrganizerSignOff()
  const strippedBody = stripLegacySignOff(plainTextBody)

  const htmlBody = strippedBody
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
  ${signOff.html}
</body>
</html>`

  const fullPlain = `${strippedBody}\n\n${signOff.plain}`

  const transporter = createTransport()
  await transporter.sendMail({ from, to: recipientEmails, subject, text: fullPlain, html })
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

  const subject = `Neue Registrierung – Freischaltung erforderlich: ${player.firstName} ${player.lastName}`
  const text = `Ein neuer Spieler hat sich registriert und wartet auf Freischaltung.\n\nName: ${player.firstName} ${player.lastName}\nE-Mail: ${player.email}\n\nBitte das Konto in der Spielerverwaltung freischalten: ${appUrl}/admin/players`
  const html = `
<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 16px">Ein neuer Spieler hat sich registriert und wartet auf Freischaltung.</p>
  <table style="border-collapse:collapse;margin-bottom:24px">
    <tr><td style="padding:4px 16px 4px 0;color:#555">Name</td><td><strong>${player.firstName} ${player.lastName}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#555">E-Mail</td><td>${player.email}</td></tr>
  </table>
  <p style="margin:0 0 16px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:10px 14px;font-size:13px">⏳ Das Konto ist noch nicht aktiv. Der Spieler kann sich erst anmelden, nachdem du es freigeschaltet hast.</p>
  <a href="${appUrl}/admin/players" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Konto freischalten →</a>
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
  const signOff = await getOrganizerSignOff()
  const text = `Hey ${player.firstName},\n\ndeine Anmeldung für den Spieltag am ${dateStr} um 20:00 Uhr wurde bestätigt.\n\nUm abzusagen, besuche die Spielplan-Seite: ${scheduleLink}\n\n${signOff.plain}`
  const html = `<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 8px">Hey ${player.firstName},</p>
  <p style="margin:0 0 16px">deine Anmeldung für den Spieltag am <strong>${dateStr}</strong> um <strong>20:00 Uhr</strong> wurde bestätigt. ✅</p>
  <a href="${scheduleLink}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Spielplan ansehen →</a>
  <p style="margin:24px 0 0;color:#555;font-size:13px">Um abzusagen, öffne den Spielplan und klicke auf "Absagen" neben dem Spieltag.</p>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  ${signOff.html}
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
  const signOff = await getOrganizerSignOff()
  const text = `Hey ${player.firstName},\n\ndein Konto bei Empor Lichtenberg ist jetzt aktiv. Du kannst dich ab sofort einloggen:\n${loginLink}\n\n${signOff.plain}`
  const html = `<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 8px">Hey ${player.firstName},</p>
  <p style="margin:0 0 16px">dein Konto bei <strong>Empor Lichtenberg</strong> ist jetzt aktiv. Du kannst dich ab sofort einloggen und deine Anmeldungen selbst verwalten.</p>
  <a href="${loginLink}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Jetzt einloggen →</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  ${signOff.html}
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
  const signOff = await getOrganizerSignOff()
  const text = `Hey ${player.firstName},\n\nder Spieltag am ${dateStr} ist bereits voll. Du stehst jetzt auf der Warteliste und wirst automatisch angemeldet, wenn ein Platz frei wird.\n\n${scheduleLink}\n\n${signOff.plain}`
  const html = `<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 8px">Hey ${player.firstName},</p>
  <p style="margin:0 0 16px">der Spieltag am <strong>${dateStr}</strong> ist bereits voll. Du stehst jetzt auf der <strong>Warteliste</strong> und wirst automatisch angemeldet, sobald ein Platz frei wird.</p>
  <a href="${scheduleLink}" style="display:inline-block;background:#1e40af;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Spielplan ansehen →</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  ${signOff.html}
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
  const signOff = await getOrganizerSignOff()
  const text = `Hey ${player.firstName},\n\nein Platz ist frei geworden! Du bist jetzt für den Spieltag am ${dateStr} angemeldet.\n\n${scheduleLink}\n\n${signOff.plain}`
  const html = `<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 8px">Hey ${player.firstName},</p>
  <p style="margin:0 0 16px">🎉 Ein Platz ist frei geworden! Du bist jetzt für den Spieltag am <strong>${dateStr}</strong> angemeldet.</p>
  <a href="${scheduleLink}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Spielplan ansehen →</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  ${signOff.html}
</body>
</html>`

  const transporter = createTransport()
  await transporter.sendMail({ from, to: player.email, subject, text, html })
}

export async function sendHallClosureConflictEmail(
  closure: { startDate: Date; endDate: Date; reason?: string | null },
  conflicts: { id: string; date: Date }[],
  organizerEmails: string[],
) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return
  if (organizerEmails.length === 0 || conflicts.length === 0) return

  const config = await db.appConfig.findUnique({ where: { key: "emailFrom" } })
  const from = config?.value ?? process.env.SMTP_USER!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"

  const startStr = format(closure.startDate, "d. MMMM yyyy", { locale: de })
  const endStr = format(closure.endDate, "d. MMMM yyyy", { locale: de })
  const periodStr = startStr === endStr ? startStr : `${startStr} – ${endStr}`
  const reasonStr = closure.reason ? ` (${closure.reason})` : ""

  const conflictList = conflicts
    .map((s) => `• ${format(s.date, "EEEE, d. MMMM yyyy", { locale: de })}`)
    .join("\n")

  const n = conflicts.length
  const subject = `⚠️ Hallensperrung: ${n} Spieltag${n > 1 ? "e betroffen" : " betroffen"}`
  const text = `Hallensperrung ${periodStr}${reasonStr} wurde gespeichert.

Folgende bereits geplante Spieltage fallen in diesen Zeitraum:

${conflictList}

Bitte prüfe, ob diese Spieltage abgesagt werden müssen.

${appUrl}/schedule`

  const transporter = createTransport()
  await transporter.sendMail({ from, to: organizerEmails, subject, text })
}

export async function sendEventStatusEmail(
  event: { id: string; title: string },
  subject: string,
  introText: string,
  recipientEmails: string[],
  results: {
    dateResults: { date: Date; yes: number; maybe: number; no: number }[]
    questionResults: { questionText: string; options: { text: string; count: number; freeTexts: string[] }[] }[]
    totalResponses: number
    declineReasons: string[]
  },
) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP is not configured on this server.")
  }
  if (recipientEmails.length === 0) throw new Error("No recipients selected.")

  const config = await db.appConfig.findUnique({ where: { key: "emailFrom" } })
  const from = config?.value ?? process.env.SMTP_USER!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://empor-lichtenberg.vercel.app"
  const link = `${appUrl}/events/${event.id}`

  const rowStyle = "padding:6px 12px;border-bottom:1px solid #e5e5e5;font-size:14px"
  const headerStyle = "padding:6px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#fff"

  // Date availability table
  const sortedDates = [...results.dateResults].sort((a, b) => b.yes - a.yes || b.maybe - a.maybe)
  const dateRowsHtml = sortedDates.map((d, i) => {
    const dateStr = format(d.date, "EEE, d. MMMM yyyy", { locale: de })
    return `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
      <td style="${rowStyle}">${dateStr}</td>
      <td style="${rowStyle};text-align:center;color:#166534;font-weight:600">${d.yes}</td>
      <td style="${rowStyle};text-align:center;color:#92400e">${d.maybe}</td>
      <td style="${rowStyle};text-align:center;color:#991b1b">${d.no}</td>
    </tr>`
  }).join("")

  const dateSectionHtml = sortedDates.length > 0 ? `
<table style="border-collapse:collapse;width:100%;margin-bottom:16px;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5">
  <thead>
    <tr style="background:#1e3a5f">
      <th style="${headerStyle};text-align:left">Datum</th>
      <th style="${headerStyle};text-align:center">✓ Ja</th>
      <th style="${headerStyle};text-align:center">~ Vielleicht</th>
      <th style="${headerStyle};text-align:center">✗ Nein</th>
    </tr>
  </thead>
  <tbody>${dateRowsHtml}</tbody>
</table>` : ""

  // Question results
  const questionSectionsHtml = results.questionResults.map((q) => {
    const total = q.options.reduce((s, o) => s + o.count, 0)
    const optionRows = q.options.map((o, i) => {
      const pct = total > 0 ? Math.round((o.count / total) * 100) : 0
      const freeTextHtml = o.freeTexts.length > 0
        ? `<div style="font-size:12px;color:#666;margin-top:4px">${o.freeTexts.map(t => `„${t.replace(/&/g,"&amp;")}"`)  .join(", ")}</div>`
        : ""
      return `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
        <td style="${rowStyle}">${o.text.replace(/&/g,"&amp;")}${freeTextHtml}</td>
        <td style="${rowStyle};text-align:right;font-weight:600">${o.count}</td>
        <td style="${rowStyle};width:100px">
          <div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden">
            <div style="background:#166534;height:8px;width:${pct}%"></div>
          </div>
        </td>
      </tr>`
    }).join("")
    return `
<p style="font-weight:600;font-size:14px;margin:16px 0 6px">${q.questionText.replace(/&/g,"&amp;")}</p>
<table style="border-collapse:collapse;width:100%;margin-bottom:8px;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5">
  <tbody>${optionRows}</tbody>
</table>`
  }).join("")

  const declineHtml = results.declineReasons.length > 0 ? `
<p style="font-weight:600;font-size:14px;margin:16px 0 6px">Ausreden (${results.declineReasons.length})</p>
<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;color:#444">
  ${results.declineReasons.map(r => `<li style="margin-bottom:4px">„${r.replace(/&/g,"&amp;")}"</li>`).join("")}
</ul>` : ""

  const introHtml = introText.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br/>")
  const signOff = await getOrganizerSignOff()
  const html = `
<!DOCTYPE html>
<html lang="de">
<body style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h1 style="font-size:18px;font-weight:700;margin:0 0 4px">${event.title.replace(/&/g,"&amp;")}</h1>
  <p style="margin:0 0 16px;font-size:13px;color:#666">${results.totalResponses} Antwort${results.totalResponses !== 1 ? "en" : ""} eingegangen</p>
  ${introText ? `<p style="white-space:pre-line;margin:0 0 24px;line-height:1.6">${introHtml}</p>` : ""}
  ${dateSectionHtml}
  ${questionSectionsHtml}
  ${declineHtml}
  <a href="${link}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">Umfrage ansehen →</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5"/>
  ${signOff.html}
</body>
</html>`

  // Plain text version
  const dateLines = sortedDates.map(d =>
    `${format(d.date, "EEE, d. MMMM yyyy", { locale: de })}: ✓${d.yes} ~${d.maybe} ✗${d.no}`
  ).join("\n")

  const questionLines = results.questionResults.map(q => {
    const opts = q.options.map(o => `  ${o.text}: ${o.count}${o.freeTexts.length ? " (" + o.freeTexts.map(t => `„${t}"`).join(", ") + ")" : ""}`).join("\n")
    return `${q.questionText}\n${opts}`
  }).join("\n\n")

  const declineLines = results.declineReasons.length > 0
    ? `Ausreden:\n${results.declineReasons.map(r => `- „${r}"`).join("\n")}`
    : ""

  const text = [
    event.title,
    `${results.totalResponses} Antworten eingegangen`,
    introText,
    dateLines && `Terminfindung:\n${dateLines}`,
    questionLines,
    declineLines,
    link,
  ].filter(Boolean).join("\n\n")

  const transporter = createTransport()
  await transporter.sendMail({ from, to: recipientEmails, subject, text, html })
  return recipientEmails.length
}
