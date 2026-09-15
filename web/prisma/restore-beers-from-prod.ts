/**
 * Restores beer stats in dev DB from prod DB.
 * Reads PlayerStats.beers and PlayerStatsLifetime.beers from prod,
 * then overwrites those fields in dev (leaves all other stats untouched).
 *
 * Run: npx tsx prisma/restore-beers-from-prod.ts --run
 */

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { config } from "dotenv"

config({ path: ".env.local", override: true })
config({ path: ".env" })

const DEV_URL = process.env.DATABASE_URL!
const PROD_URL = "postgresql://neondb_owner:npg_c1PZJa6RNheu@ep-autumn-base-asjrypjf-pooler.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

const devDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: DEV_URL }) })
const prodDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: PROD_URL }) })

async function main() {
  const run = process.argv.includes("--run")
  if (!run) console.log("Dry run. Pass --run to apply changes.")

  const [prodSeason, prodLifetime] = await Promise.all([
    prodDb.playerStats.findMany({ select: { playerId: true, seasonId: true, beers: true } }),
    prodDb.playerStatsLifetime.findMany({ select: { playerId: true, beers: true } }),
  ])

  const seasonWithBeers = prodSeason.filter((r) => Number(r.beers) > 0)
  const lifetimeWithBeers = prodLifetime.filter((r) => Number(r.beers) > 0)

  console.log(`Prod: ${seasonWithBeers.length} season rows with beers > 0`)
  console.log(`Prod: ${lifetimeWithBeers.length} lifetime rows with beers > 0`)
  seasonWithBeers.forEach((r) => console.log(`  season: playerId=${r.playerId} seasonId=${r.seasonId} beers=${r.beers}`))
  lifetimeWithBeers.forEach((r) => console.log(`  lifetime: playerId=${r.playerId} beers=${r.beers}`))

  if (!run) { await prodDb.$disconnect(); await devDb.$disconnect(); return }

  for (const r of seasonWithBeers) {
    await devDb.playerStats.updateMany({
      where: { playerId: r.playerId, seasonId: r.seasonId },
      data: { beers: Number(r.beers) },
    })
  }
  for (const r of lifetimeWithBeers) {
    await devDb.playerStatsLifetime.updateMany({
      where: { playerId: r.playerId },
      data: { beers: Number(r.beers) },
    })
  }

  console.log("Done. Beer stats restored in dev DB.")
  await prodDb.$disconnect()
  await devDb.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
