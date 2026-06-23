import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

export async function POST(req: NextRequest) {
  const { firstName, lastName, email, password } = await req.json()

  if (!firstName || !lastName || !email || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 })
  }

  const existing = await db.player.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: "Email already in use." }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await db.player.create({
    data: { firstName, lastName, email, passwordHash },
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
