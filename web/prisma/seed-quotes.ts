import { db } from "../src/lib/db"

const quotes = [
  { quote: "Der Ball ist rund.", author: "Sepp Herberger" },
  { quote: "Ein Spiel dauert 90 Minuten.", author: "Sepp Herberger" },
  { quote: "Nach dem Spiel ist vor dem Spiel.", author: "Sepp Herberger" },
  { quote: "Der Ball hat keine Ecken.", author: "Adi Preißler" },
  { quote: "Fußball ist wie Schach, nur ohne Würfel.", author: "Lukas Podolski" },
  { quote: "Ich bin nicht arrogant, ich bin nur besser als ihr.", author: "Zlatan Ibrahimović" },
  { quote: "An Unmögliches glauben wir sofort, Wunder dauern etwas länger.", author: "Sepp Herberger" },
  { quote: "Fußball ist die schönste Nebensache der Welt.", author: "unbekannt" },
  { quote: "Ohne Fleiß kein Preis.", author: "unbekannt" },
  { quote: "Erst wenn der letzte Baum gefällt ist, merkt man, dass man keinen Torschuss mehr üben kann.", author: "Lukas Podolski" },
  { quote: "Im Fußball kommt es darauf an, das Runde ins Eckige zu bringen.", author: "unbekannt" },
  { quote: "Der beste Platz für Philosophen ist ein Fußballfeld.", author: "Albert Camus" },
  { quote: "Das Wichtigste im Sport ist nicht der Sieg, sondern die Teilnahme.", author: "Pierre de Coubertin" },
  { quote: "Ich habe keine Angst vor dem Verlieren. Ich habe Angst vor dem Nicht-Versuchen.", author: "Michael Jordan" },
  { quote: "Champions werden nicht in Turnhallen gemacht. Champions werden aus etwas gemacht, das tief in ihnen steckt.", author: "Muhammad Ali" },
  { quote: "Schweiß ist der Treibstoff des Champions.", author: "unbekannt" },
  { quote: "Talent gewinnt Spiele, aber Teamwork und Intelligenz gewinnen Meisterschaften.", author: "Michael Jordan" },
  { quote: "Fußball ist Kunst, wenn er schön gespielt wird.", author: "Johan Cruyff" },
  { quote: "Bevor ich den Ball bekomme, weiß ich bereits, was ich damit mache.", author: "Johan Cruyff" },
  { quote: "Im Fußball ist nichts unmöglich.", author: "Franz Beckenbauer" },
]

async function main() {
  const existing = await db.quoteCollection.count()
  if (existing > 0) {
    console.log(`Already ${existing} quotes in collection, skipping.`)
    process.exit(0)
  }
  await db.quoteCollection.createMany({ data: quotes })
  console.log(`Seeded ${quotes.length} quotes.`)
  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
