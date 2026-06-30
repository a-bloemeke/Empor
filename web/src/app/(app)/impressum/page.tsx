export default function ImpressumPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold mb-1">Impressum</h1>
        <p className="text-sm text-muted-foreground">Angaben gemäß § 5 TMG</p>
      </div>

      <section className="space-y-1 text-sm">
        <p className="font-semibold">Andreas Bloemeke</p>
        <p>Charlottenstraße 34</p>
        <p>13156 Berlin</p>
        <p>Deutschland</p>
      </section>

      <section className="space-y-1 text-sm">
        <h2 className="font-semibold text-base">Kontakt</h2>
        <p>E-Mail: <a href="mailto:abloemeke@gmail.com" className="text-primary hover:underline">abloemeke@gmail.com</a></p>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-base">Hinweis</h2>
        <p className="text-muted-foreground leading-relaxed">
          Diese Website ist ein privates, nicht-kommerzielles Angebot und dient ausschließlich der Organisation
          von Fußballspielen einer kleinen, geschlossenen Gruppe von Freizeitkickern. Es werden keine Waren
          oder Dienstleistungen angeboten. Die Nutzung ist auf eingeladene Mitglieder der Gruppe beschränkt.
        </p>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold text-base">Haftungsausschluss</h2>
        <p className="text-muted-foreground leading-relaxed">
          Die Inhalte dieser Seite wurden mit größtmöglicher Sorgfalt erstellt. Für die Richtigkeit,
          Vollständigkeit und Aktualität der Inhalte wird keine Gewähr übernommen. Als privater Anbieter bin
          ich gemäß § 7 Abs. 1 TMG für eigene Inhalte verantwortlich. Eine Verpflichtung zur Überwachung
          übermittelter oder gespeicherter fremder Informationen besteht nicht.
        </p>
      </section>

      <hr className="border-border" />

      <div>
        <h2 className="text-lg font-bold mb-1">Legal Notice <span className="text-sm font-normal text-muted-foreground">(English)</span></h2>
      </div>

      <section className="space-y-2 text-sm">
        <p className="text-muted-foreground leading-relaxed">
          This website is a private, non-commercial project used solely to organise football sessions for a
          small, closed group of recreational players. No goods or services are offered. Access is limited
          to invited members of the group.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          Responsible person under German law (§ 5 TMG):<br />
          Andreas Bloemeke, Charlottenstraße 34, 13156 Berlin, Germany<br />
          Contact: <a href="mailto:abloemeke@gmail.com" className="text-primary hover:underline">abloemeke@gmail.com</a>
        </p>
      </section>
    </div>
  )
}
