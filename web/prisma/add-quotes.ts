// Run: npx dotenvx run -f .env.local -- npx tsx prisma/add-quotes.ts
// For prod: mv .env.local .env.local.bak && npx tsx prisma/add-quotes.ts && mv .env.local.bak .env.local
import { db } from "@/lib/db"

const quotes = [
  { quote: "Ich hätte keine Rote Karte gegeben. Aber es war schon ein dummes Foul, deshalb hätte ich die Rote Karte vielleicht doch gegeben.", author: "Rudi Völller" },
  { quote: "Wenn ich meiner Frau ein Geheimnis erzählen will, weiß es der Kölner Express vorher.", author: "Ståle Solbakken" },
  { quote: "Es muss eine Kehrtwende geben. Und die muss 360 Grad sein.", author: "Eduard Geyer" },
  { quote: "Es ist so, dass wir im Fußball nicht immer die Wahrheit sagen. Das ist jetzt keine Lüge.", author: "Max Eberl" },
  { quote: "Ich bin körperlich und physisch topfit.", author: "Thomas Häßler" },
  { quote: "Das Runde muss in das Eckige.", author: "Sepp Herberger" },
  { quote: "Bringt doch nichts, wenn wir jetzt schon alles zeigen, was wir trainiert haben.", author: "Marco Reus" },
  { quote: "Es gibt viele Champions, die zu Alkoholikern geworden sind, aber ich bin der einzige Alkoholiker, der zum Champion wurde.", author: "George Best" },
  { quote: "Ich dachte, meine Frau pfeift heute. Die pfeift auch immer für die mit den schönsten Trikots.", author: "Tim Walter" },
  { quote: "Wir haben ganz schwach begonnen und dann ganz stark nachgelassen.", author: "Klaus Augenthaler" },
  { quote: "Ich bin wie Gott: Ich werde nie krank und ich habe immer recht.", author: "Louis van Gaal" },
  { quote: "Es wird langsam Zeit, dass wir Köpfe mit Nägeln machen.", author: "Klaus Täuber" },
  { quote: "Da geht Lothar Matthäus. Ein großer Spieler. Ein Mann wie Steffi Graf.", author: "Jörg Dahlmann" },
  { quote: "Ich habe nie an unserer Chancenlosigkeit gezweifelt.", author: "Richard Golz" },
  { quote: "Mir ist es egal, ob es ein Brasilianer, Pole, Kroate, Norddeutscher oder Süddeutscher ist. Die Leistung entscheidet, nicht irgendeine Blutgruppe.", author: "Christoph Daum" },
  { quote: "Man muss auch mal aus zwei Chancen drei Tore machen.", author: "Carsten Jancker" },
  { quote: "Die Europäer können 100 Minuten und mehr spielen, wir haben schon Schwierigkeiten mit 90.", author: "Hernán Darío Gómez" },
  { quote: "Vielleicht ist es ein Vorteil, dass wir ganz hinten stehen.", author: "Georg Margreitter" },
  { quote: "Das nächste Spiel ist immer das nächste.", author: "Matthias Sammer" },
  { quote: "So ist Fußball. Manchmal gewinnt der Bessere.", author: "Lukas Podolski" },
  { quote: "Unsere Standards sind wie ein Elfmeter für den Gegner.", author: "Timo Werner" },
  { quote: "Ihr fünf spielt jetzt vier gegen drei.", author: "Fritz Langner" },
  { quote: "Wenn der Ball im Tor ist, war das immer eine gute Maßnahme.", author: "Günter Netzer" },
  { quote: "Wäre es kälter gewesen, wäre vielleicht einer am Boden festgefroren.", author: "Peter Neururer" },
  { quote: "Vielleicht liegt das Geheimnis unseres Erfolgs darin, dass mich meine Spieler nicht verstehen.", author: "Bernd Krauss" },
  { quote: "Fußball ist Fußball. Egal, ob Mann oder Frau, es gibt die gleichen Pappnasen, die gleichen Sensibelchen, die gleichen Sorgen. Das tut sich nichts.", author: "Inka Grings" },
  { quote: "In 57 Minuten hat Erling Haaland mehr Tore gemacht als ich in der ganzen Saison.", author: "Thorgan Hazard" },
  { quote: "Die Leute wissen nichts von mir. Ich habe kein Facebook-Profil, wo ich meinen Hamster fotografiere.", author: "Sandro Wagner" },
  { quote: "Vor einem Jahr noch hätte ich gesagt: Hamburg hat drei Perlen – die Elbphilharmonie, unser neues Hotel und den HSV. Jetzt hat es nur noch zwei Perlen.", author: "Klaus-Michael Kühne" },
  { quote: "Der Einzige, den ich gesiezt hab, war Olli Kahn. Ich war Mitte 20 und hatte Angst.", author: "Manuel Gräfe" },
  { quote: "Wir haben uns relaxed auf diese Spiele vorbereitet. Man musste jedenfalls keine Angst davor haben, die Zuschauer zu verärgern, wenn man einen Fehler macht.", author: "Roman Bürki" },
  { quote: "Im Alter von 33 Jahren brauche ich mich nicht mehr warmlaufen.", author: "Gonzalo Castro" },
  { quote: "Der eine ist 'The Special One', der andere ist 'The Normal One': Ich bin 'The New One.'", author: "Stefan Effenberg" },
  { quote: "Mein Kölsch ist nicht ganz so gut. Erst nach dem zweiten oder dritten Kölsch wird es besser.", author: "Mark Uth" },
]

async function main() {
  const before = await db.quoteCollection.count()
  const result = await db.quoteCollection.createMany({ data: quotes, skipDuplicates: true })
  const after = await db.quoteCollection.count()
  console.log(`Inserted: ${result.count}, skipped (duplicates): ${quotes.length - result.count}, total in DB: ${after} (was ${before})`)
}

main().catch(console.error).finally(() => db.$disconnect())
