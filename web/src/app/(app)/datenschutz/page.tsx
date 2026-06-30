export default function DatenschutzPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold mb-1">Datenschutzerklärung</h1>
        <p className="text-sm text-muted-foreground">gemäß DSGVO / Art. 13 DSGVO</p>
      </div>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-base">1. Verantwortlicher</h2>
        <p className="text-muted-foreground leading-relaxed">
          Verantwortlicher im Sinne der DSGVO ist:<br />
          Andreas Bloemeke, Charlottenstraße 34, 13156 Berlin<br />
          E-Mail: <a href="mailto:abloemeke@gmail.com" className="text-primary hover:underline">abloemeke@gmail.com</a>
        </p>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-base">2. Zweck und Rechtsgrundlage</h2>
        <p className="text-muted-foreground leading-relaxed">
          Diese Website dient ausschließlich der privaten, nicht-kommerziellen Organisation von
          Fußballspielen einer geschlossenen Gruppe. Die Verarbeitung personenbezogener Daten erfolgt
          auf Basis von Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung / vorvertragliche Maßnahmen)
          sowie Art. 6 Abs. 1 lit. a DSGVO (Einwilligung durch freiwillige Registrierung).
        </p>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-base">3. Erhobene Daten</h2>
        <p className="text-muted-foreground leading-relaxed">
          Im Rahmen der Nutzung werden folgende personenbezogene Daten gespeichert:
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-1 leading-relaxed">
          <li>Vor- und Nachname</li>
          <li>E-Mail-Adresse</li>
          <li>Passwort (verschlüsselt gespeichert, nie im Klartext)</li>
          <li>Optionale Angaben: Spitzname, Geburtsdatum, Anschrift</li>
          <li>Spielstatistiken (Tore, Assists, Punkte, Spieltage)</li>
          <li>An- und Abmeldungen zu Spieltagen</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-base">4. Weitergabe an Dritte</h2>
        <p className="text-muted-foreground leading-relaxed">
          Daten werden nicht an Dritte verkauft oder für Werbezwecke genutzt. Zur technischen
          Bereitstellung der Website werden folgende Dienste eingesetzt:
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-1 leading-relaxed">
          <li><strong>Vercel Inc.</strong> (USA) — Hosting der Webanwendung. Datenverarbeitung gemäß Vercel-Datenschutzrichtlinie.</li>
          <li><strong>Neon Inc.</strong> (USA) — Datenbankhosting (PostgreSQL). Daten werden verschlüsselt gespeichert.</li>
        </ul>
        <p className="text-muted-foreground leading-relaxed">
          Beide Anbieter sind im Rahmen des EU-US Data Privacy Framework zertifiziert bzw. bieten
          Standardvertragsklauseln (SCC) gemäß Art. 46 DSGVO an.
        </p>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-base">5. Speicherdauer</h2>
        <p className="text-muted-foreground leading-relaxed">
          Personenbezogene Daten werden gespeichert, solange ein aktives Konto besteht. Nach Löschung
          des Kontos werden alle zugehörigen Daten entfernt, sofern keine gesetzlichen
          Aufbewahrungspflichten entgegenstehen.
        </p>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-base">6. Deine Rechte</h2>
        <p className="text-muted-foreground leading-relaxed">
          Du hast gemäß DSGVO folgende Rechte:
        </p>
        <ul className="list-disc list-inside text-muted-foreground space-y-1 leading-relaxed">
          <li>Auskunft über gespeicherte Daten (Art. 15 DSGVO)</li>
          <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
          <li>Löschung deiner Daten (Art. 17 DSGVO)</li>
          <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
          <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</li>
          <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
        </ul>
        <p className="text-muted-foreground leading-relaxed">
          Zur Ausübung deiner Rechte wende dich an:{" "}
          <a href="mailto:abloemeke@gmail.com" className="text-primary hover:underline">abloemeke@gmail.com</a>
        </p>
        <p className="text-muted-foreground leading-relaxed">
          Du hast außerdem das Recht, dich bei der zuständigen Aufsichtsbehörde zu beschweren.
          Für Berlin ist dies die Berliner Beauftragte für Datenschutz und Informationsfreiheit
          (<a href="https://www.datenschutz-berlin.de" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">www.datenschutz-berlin.de</a>).
        </p>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-base">7. E-Mail-Benachrichtigungen</h2>
        <p className="text-muted-foreground leading-relaxed">
          Bei der Anlage eines neuen Spieltags wird eine Benachrichtigung per E-Mail an alle
          registrierten Mitglieder der Gruppe verschickt. Diese E-Mails enthalten keine Trackingpixel
          und werden ausschließlich für die Gruppenorganisation eingesetzt.
        </p>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-base">8. Cookies und Tracking</h2>
        <p className="text-muted-foreground leading-relaxed">
          Diese Website verwendet ausschließlich technisch notwendige Cookies (Session-Cookie für die
          Anmeldung, Spracheinstellung). Es werden keine Analyse-, Werbe- oder Tracking-Cookies
          eingesetzt. Eine Einwilligungspflicht nach § 25 TTDSG besteht für diese Cookies nicht.
        </p>
      </section>

      <hr className="border-border" />

      <div>
        <h2 className="text-lg font-bold mb-1">Privacy Policy <span className="text-sm font-normal text-muted-foreground">(English summary)</span></h2>
      </div>

      <section className="space-y-2 text-sm">
        <p className="text-muted-foreground leading-relaxed">
          This is a private, non-commercial website for organising recreational football sessions for a
          small closed group. The controller under GDPR is Andreas Bloemeke (contact above).
        </p>
        <p className="text-muted-foreground leading-relaxed">
          <strong>Data collected:</strong> name, email, hashed password, optional profile details
          (nickname, date of birth, address), match statistics and session registrations.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          <strong>Purpose:</strong> Organising game days and tracking statistics within the group.
          Data is never sold or used for advertising.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          <strong>Hosting:</strong> Vercel (application) and Neon (database), both operating under
          GDPR-compliant data processing agreements.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          <strong>Your rights:</strong> You may request access, correction, deletion, or a copy of
          your data at any time by contacting{" "}
          <a href="mailto:abloemeke@gmail.com" className="text-primary hover:underline">abloemeke@gmail.com</a>.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          <strong>Cookies:</strong> Only strictly necessary cookies are used (login session,
          language preference). No tracking or analytics cookies.
        </p>
      </section>
    </div>
  )
}
