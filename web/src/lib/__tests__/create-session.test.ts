import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  db: {
    season: { findUnique: vi.fn() },
    session: { create: vi.fn() },
  },
}))
vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { createSession } from "@/app/(app)/schedule/actions"

describe("createSession", () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ORGANIZER" } } as any)
  })

  it("throws when no season exists for the given year", async () => {
    vi.mocked(db.season.findUnique).mockResolvedValue(null)
    await expect(createSession("2026-10-01T20:00:00.000Z")).rejects.toThrow("No season exists for 2026")
  })

  it("throws when the season is already completed", async () => {
    vi.mocked(db.season.findUnique).mockResolvedValue({ id: "s1", year: 2026, status: "COMPLETED" } as any)
    await expect(createSession("2026-10-01T20:00:00.000Z")).rejects.toThrow("already closed")
  })
})
