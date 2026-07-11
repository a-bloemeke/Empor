/**
 * Recomputes PlayerStats and PlayerStatsLifetime for all completed sessions
 * from scratch, using the current computeAndSaveStats logic.
 *
 * Run with:  npx tsx prisma/recompute-stats.ts [--run]
 * Dry-run (default) only prints what it would do.
 */
import { db } from "../src/lib/db"
import { computeAndSaveStats } from "../src/lib/stats"

async function main() {
  const dryRun = process.argv[2] !== "--run"
  if (dryRun) {
    console.log("DRY RUN — pass --run to actually recompute.\n")
  }

  const sessions = await db.session.findMany({
    where: { status: "COMPLETED" },
    select: { id: true, date: true },
    orderBy: { date: "asc" },
  })

  console.log(`Found ${sessions.length} completed session(s).`)

  if (dryRun) {
    sessions.forEach((s) => console.log(`  ${s.date.toISOString().slice(0, 10)}  ${s.id}`))
    console.log("\nNo changes made. Pass --run to recompute.")
    await db.$disconnect()
    return
  }

  // Wipe existing stats — recompute will rebuild them correctly
  console.log("\nClearing PlayerStats and PlayerStatsLifetime...")
  await db.playerStats.deleteMany()
  await db.playerStatsLifetime.deleteMany()
  console.log("Cleared.")

  for (const s of sessions) {
    console.log(`Recomputing ${s.date.toISOString().slice(0, 10)}  ${s.id} ...`)
    await computeAndSaveStats(s.id)
  }

  console.log("\nDone. All stats recomputed with correct attendance +1.")
  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
