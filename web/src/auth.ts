import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

class InactiveAccountError extends CredentialsSignin {
  code = "account_inactive" as const
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const player = await db.player.findUnique({
          where: { email: credentials.email as string },
        })

        if (!player?.passwordHash) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          player.passwordHash
        )
        if (!valid) return null

        if (!player.active) throw new InactiveAccountError()

        return {
          id: player.id,
          email: player.email,
          name: player.nickname ?? `${player.firstName} ${player.lastName}`.trim(),
          role: player.role,
        }
      },
    }),
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const pathname = nextUrl.pathname
      const isPublicPage =
        pathname === "/" ||
        pathname.startsWith("/login") ||
        pathname.startsWith("/register") ||
        pathname.startsWith("/leaderboard") ||
        pathname.startsWith("/schedule")
      if (isPublicPage) return true
      return isLoggedIn
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role: string }).role
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    },
  },
})
