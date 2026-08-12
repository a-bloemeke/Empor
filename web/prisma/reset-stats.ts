import { db } from "../src/lib/db"

async function main() {
  const [ps, lt, g, m] = await Promise.all([
    db.playerStats.count(),
    db.playerStatsLifetime.count(),
    db.goal.count(),
    db.match.count(),
  ])
  console.log("PlayerStats:", ps)
  console.log("PlayerStatsLifetime:", lt)
  console.log("Goals:", g)
  console.log("Matches:", m)

  if (process.argv[2] === "--delete") {
    console.log("\nDeleting...")
    await db.goal.deleteMany()
    await db.match.deleteMany()
    await db.playerStats.deleteMany()
    await db.playerStatsLifetime.deleteMany()
    console.log("Done.")
  } else {
    console.log("\nRun with --delete to wipe all stats, goals and matches.")
  }

  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
