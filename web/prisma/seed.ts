import "dotenv/config"
import { PrismaClient, Role } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  const year = new Date().getFullYear()

  const season = await db.season.upsert({
    where: { year },
    update: {},
    create: { year },
  })
  console.log(`Season ${year} ready (id: ${season.id})`)

  const orgHash = await bcrypt.hash("password", 12)
  const organizer = await db.player.upsert({
    where: { email: "organizer@empor.app" },
    update: {},
    create: {
      email: "organizer@empor.app",
      firstName: "Anna",
      lastName: "Organizer",
      passwordHash: orgHash,
      role: Role.ORGANIZER,
    },
  })
  console.log(`Organizer: ${organizer.email}`)

  const playerData = [
    { email: "player1@empor.app", firstName: "Luca", lastName: "Rossi" },
    { email: "player2@empor.app", firstName: "Marco", lastName: "Bianchi" },
    { email: "player3@empor.app", firstName: "Sara", lastName: "Ferri" },
    { email: "player4@empor.app", firstName: "Giulia", lastName: "Ricci" },
    { email: "player5@empor.app", firstName: "Tom", lastName: "Müller" },
  ]

  const hash = await bcrypt.hash("password", 12)
  for (const p of playerData) {
    const player = await db.player.upsert({
      where: { email: p.email },
      update: {},
      create: { ...p, passwordHash: hash },
    })
    console.log(`Player: ${player.email}`)
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
