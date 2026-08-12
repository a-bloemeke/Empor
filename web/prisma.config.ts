// Load .env.local first (dev DB), falling back to .env (prod DB).
// This ensures `prisma migrate dev` always targets the dev database locally,
// preventing accidental migrations against prod before dev is tested.
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local", override: true });
config({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
