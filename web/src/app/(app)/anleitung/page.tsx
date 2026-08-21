import Link from "next/link"

type Feature = { icon: string; title: string; body: string }

const status: { label: string; desc: string; cls: string }[] = [
  { label: "Angemeldet", desc: "Fester Platz – du bist dabei.", cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  { label: "Vielleicht", desc: "Unverbindliche Rückmeldung, kein gesicherter Platz.", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { label: "Abgesagt", desc: "Du hast abgesagt.", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  { label: "Warteliste", desc: "Spieltag voll – du rückst bei Absagen automatisch nach.", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  { label: "Ausstehend", desc: "Anmeldung wartet auf Bestätigung durch den Organisator.", cls: "bg-muted text-muted-foreground" },
]

const features: Feature[] = [
  { icon: "1️⃣", title: "Konto erstellen & anmelden", body: "Neu dabei? Über „Registrieren“ ein Konto anlegen. Ein Organisator schaltet dich frei – du bekommst eine E-Mail, sobald du dich mit E-Mail und Passwort anmelden kannst." },
  { icon: "📅", title: "Spielplan ansehen", body: "Unter „Spielplan“ siehst du alle kommenden und vergangenen Spieltage mit Datum, Uhrzeit und belegten Plätzen (z. B. 8/12). Dein eigener Status ist farbig markiert." },
  { icon: "✅", title: "Anmelden", body: "Beim Spieltag auf „Anmelden“ klicken – dein Status wechselt auf „Angemeldet“. Ist der Spieltag voll, kommst du automatisch auf die Warteliste." },
  { icon: "🤔", title: "„Vielleicht“", body: "Noch unsicher? Mit „Vielleicht“ gibst du eine unverbindliche Rückmeldung. Das sichert KEINEN Platz – du kannst später auf „Anmelden“ oder „Absagen“ wechseln." },
  { icon: "❌", title: "Absagen", body: "Mit „Absagen“ abmelden – möglich bis 1 Stunde vor Spielbeginn. Danach ist der Button gesperrt; melde dich dann direkt beim Organisator. Gibst du einen Platz frei, rückt automatisch die Warteliste nach." },
  { icon: "⏳", title: "Warteliste", body: "Ist ein Spieltag voll, wirst du beim Anmelden automatisch auf die Warteliste gesetzt und per E-Mail informiert. Beim Nachrücken bekommst du ebenfalls eine E-Mail." },
  { icon: "🍺", title: "Bier mitbringen", body: "Nur für angemeldete Spieler: Mit „Bier mitbringen 🍺“ trägst du dich als Bier-Bringer ein. Pro Spieltag gibt es genau einen – für alle sichtbar (z. B. „🍺 Max“). Erneuter Klick trägt dich wieder aus." },
  { icon: "🔒", title: "Hallensperrungen", body: "Ist die Halle gesperrt (z. B. Ferien, Feiertage), erscheint das rot markiert im Spielplan. An diesen Tagen finden keine Spieltage statt." },
  { icon: "🏆", title: "Rangliste & Profil", body: "Unter „Rangliste“ siehst du Tore, Vorlagen und Punkte. Über das Menü mit deinem Namen erreichst du dein „Profil“ mit deinen persönlichen Statistiken." },
  { icon: "📧", title: "E-Mails", body: "Du bekommst automatisch Einladungen, Anmelde-Bestätigungen, Warteliste-Infos und Absagen per E-Mail." },
]

export default function AnleitungPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 space-y-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold">Spieler-Anleitung</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          So meldest du dich zu einem Spieltag an, sagst wieder ab und nutzt alle Funktionen der App.
        </p>
        <a
          href="/spieler-anleitung.txt"
          download
          className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-card px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
        >
          ⬇️ Anleitung als Textdatei herunterladen
        </a>
      </div>

      <section className="space-y-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="font-bold text-sm flex items-center gap-2">
              <span className="text-lg">{f.icon}</span> {f.title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mt-1">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Dein Status auf einen Blick</h2>
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {status.map((s) => (
            <div key={s.label} className="flex items-center gap-3 px-4 py-3">
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
              <span className="text-sm text-muted-foreground">{s.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-2">
        <h2 className="font-bold text-sm">Kurz-Tipps</h2>
        <ul className="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
          <li>Melde dich früh an – die Plätze sind begrenzt (Standard: 12).</li>
          <li>Sag rechtzeitig ab (spätestens 1 Std. vorher), damit die Warteliste nachrücken kann.</li>
          <li>Nutze „Vielleicht“ nur als Zwischenstand, nicht als Zusage.</li>
        </ul>
      </section>

      <div className="text-center">
        <Link href="/schedule" className="text-sm font-semibold text-primary hover:underline">
          → Zum Spielplan
        </Link>
      </div>
    </div>
  )
}
