#!/usr/bin/env npx tsx
// Full pipeline: HEIC folder → JPEG → Claude vision OCR → QuoteCollection DB insert
//
// Usage: npx dotenvx run -f .env.local -- npx tsx prisma/import-calendar-quotes.ts [folder]
// Default folder: ~/Pictures/Fussball-Sprueche
//
// Requires ANTHROPIC_API_KEY in .env.local
// For prod: mv .env.local .env.local.bak && npx tsx prisma/import-calendar-quotes.ts [folder] && mv .env.local.bak .env.local

import { execSync } from "child_process"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join, basename } from "path"
import { homedir } from "os"
import { db } from "@/lib/db"

const folder = process.argv[2]
  ? process.argv[2].replace(/^~/, homedir())
  : join(homedir(), "Pictures", "Fussball-Sprueche")

if (!existsSync(folder)) {
  console.error(`Folder not found: ${folder}`)
  process.exit(1)
}

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY not set — add it to .env.local")
  process.exit(1)
}

// Step 1: find all HEIC files
const heicFiles = readdirSync(folder).filter((f) => /\.(heic|HEIC)$/.test(f)).map((f) => join(folder, f))
console.log(`Found ${heicFiles.length} HEIC file(s) in ${folder}`)

// Step 2: convert HEIC → JPEG (skip if already converted)
let converted = 0
const jpegFiles: string[] = []
for (const heic of heicFiles) {
  const jpg = heic.replace(/\.(heic|HEIC)$/, ".jpg")
  jpegFiles.push(jpg)
  if (existsSync(jpg)) continue
  execSync(`sips -s format jpeg "${heic}" --out "${jpg}"`, { stdio: "pipe" })
  converted++
}
console.log(`Converted ${converted} HEIC → JPEG (${heicFiles.length - converted} already existed)`)

// Step 3: extract quote+author from each JPEG via Claude vision
console.log(`Extracting quotes from ${jpegFiles.length} image(s) via Claude API...`)

const extracted: { quote: string; author: string; file: string }[] = []
let errors = 0

for (const jpg of jpegFiles) {
  const imageData = readFileSync(jpg).toString("base64")
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: imageData },
              },
              {
                type: "text",
                text: 'This is a page from a football quote calendar. Extract the quote text and the author name (shown in the green label). Return ONLY a JSON object: {"quote": "...", "author": "..."}. No markdown, no explanation.',
              },
            ],
          },
        ],
      }),
    })
    const json = await res.json() as { content: { type: string; text: string }[] }
    const text = json.content?.[0]?.text?.trim() ?? ""
    const parsed = JSON.parse(text) as { quote: string; author: string }
    extracted.push({ quote: parsed.quote, author: parsed.author, file: basename(jpg) })
    process.stdout.write(".")
  } catch {
    console.error(`\nFailed to extract from ${basename(jpg)}`)
    errors++
  }
}
console.log(`\nExtracted ${extracted.length} quote(s), ${errors} error(s)`)

// Step 4: write extracted results to JSON for review
const outPath = join(folder, "quotes-extracted.json")
writeFileSync(outPath, JSON.stringify(extracted, null, 2))
console.log(`Written to ${outPath}`)

// Step 5: insert into QuoteCollection (skip duplicates)
const insertData = extracted.map(({ quote, author }) => ({ quote, author }))
const result = await db.quoteCollection.createMany({ data: insertData, skipDuplicates: true })
console.log(`DB: inserted ${result.count}, skipped ${insertData.length - result.count} duplicate(s)`)

await db.$disconnect()
