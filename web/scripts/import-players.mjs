import { PrismaClient } from "../src/generated/prisma/index.js"
import bcrypt from "bcryptjs"

const db = new PrismaClient()

function fix(s) {
  if (!s) return ""
  return s
    .replace(/Ã¶/g, "ö").replace(/Ã¤/g, "ä").replace(/Ã¼/g, "ü")
    .replace(/Ã–/g, "Ö").replace(/Ã„/g, "Ä").replace(/Ãœ/g, "Ü")
    .replace(/ÃŸ/g, "ß").replace(/Ã©/g, "é").replace(/Ã/g, "Ö")
    .replace(/﻿/g, "").trim()
}

function parseDate(s) {
  if (!s || !s.trim()) return null
  const parts = s.trim().split(".")
  if (parts.length !== 3) return null
  let [d, m, y] = parts.map(Number)
  if (y < 100) y += y >= 24 ? 1900 : 2000
  const dt = new Date(y, m - 1, d)
  return isNaN(dt.getTime()) ? null : dt
}

const csv = `Baltz;Steffen;15566;; SchÃ¶neiche;Rosa-Luxemburg-Str.16;28.09.65
BlÃ¶meke;Andreas;13156;; Berlin;CharlottenstraÃe 34;07.10.66
Carus;Robert;12555;; Berlin;LandjÃ¤gerstrasse 30;24.03.73
Friedrich;Tim;10247;; Berlin;An den Eldenaer HÃ¶fen 53;27.04.77
Gornig;Mika;13156;; Berlin;Majakowskiring 62;24.06.69
Hanel;Patrick;12437;; Berlin;Mahonienweg 44H;23.02.73
Heidenreich;Frank;10318;; Berlin;Grafenauer Weg 54;02.02.64
Jentsch;Sebastian;13189;; Berlin;Treskowstrasse 53;25.11.88
Liebherr;Lutz;12589;; Berlin;AhornstraÃe 26;03.04.68
Paulsen;Kai;12203;; Berlin;HolbeinstraÃe 21;07.12.55
Rabus;Alexander;13156;; Berlin;BeuthstraÃe 47;29.05.73
SchÃ¼tz;Mathias;13187;; Berlin;Gaillardstrasse 3;23.08.67
Waschke;Berhard;10247;; Berlin;Zur BÃ¶rse 38;01.04.76
Winkelmann;Volker;10247;; Berlin;BÃ¤nschstraÃe52;22.10.68
Winkler;Steffen;10179;; Berlin;Neue RoÃstraÃe 20;19.02.67
Simon;Heiko;16540;;Hohen Neuendorf;ElsastraÃe 27;06.08.67
Simon;Robert;16541;;Hohen Neuendorf;ElsastraÃe 27;28.06.08
Bachmann;Matthias;13156;; Berlin;CharlottenstraÃe 30;16.11.67
Ludwig;Harald;13156;; Berlin;CharlottenstraÃe 30;04.03.63
Berg;Martin;13156;;Berlin;KlothildestraÃe 8;18.12.70
BÃ¼chner;Frank;10247;;Berlin;Richard-Ermisch-StraÃe 59;17.04.87
;JÃ¶rn;;;;;
;William;;;;;`

const DEFAULT_PASSWORD = "empor2026"

async function main() {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12)

  const rows = csv.split("\n").map(line => {
    const [lastName, firstName, postal, , city, street, dob] = line.split(";")
    const fn = fix(firstName)
    const ln = fix(lastName)
    if (!fn) return null
    return {
      firstName: fn,
      lastName: ln,
      addressPostalCode: fix(postal) || null,
      addressCity: fix(city) || null,
      addressStreet: fix(street) || null,
      dateOfBirth: parseDate(fix(dob)),
    }
  }).filter(Boolean)

  let created = 0
  let skipped = 0

  for (const p of rows) {
    // Derive email from name: firstname.lastname@empor.app (lowercase, no spaces)
    const emailBase = `${p.firstName.toLowerCase().replace(/[^a-z0-9]/g, "")}.${p.lastName.toLowerCase().replace(/[^a-z0-9]/g, "") || "player"}`
    let email = `${emailBase}@empor.app`

    // Handle duplicate emails (e.g. two Steffens)
    const existing = await db.player.findUnique({ where: { email } })
    if (existing) {
      // Check if it's truly a duplicate name — if so skip, otherwise suffix
      if (existing.firstName === p.firstName && existing.lastName === p.lastName) {
        console.log(`  SKIP (already exists): ${p.firstName} ${p.lastName}`)
        skipped++
        continue
      }
      email = `${emailBase}2@empor.app`
    }

    await db.player.create({
      data: {
        email,
        firstName: p.firstName,
        lastName: p.lastName,
        passwordHash: hash,
        dateOfBirth: p.dateOfBirth,
        addressStreet: p.addressStreet,
        addressCity: p.addressCity,
        addressPostalCode: p.addressPostalCode,
        role: "PLAYER",
      },
    })
    console.log(`  CREATED: ${p.firstName} ${p.lastName} → ${email}`)
    created++
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`)
  console.log(`Default password for all new players: ${DEFAULT_PASSWORD}`)
}

main().catch(console.error).finally(() => db.$disconnect())
