import { auth } from "@/auth"
import { SessionProvider } from "next-auth/react"
import { Nav } from "@/components/app/nav"
import { Toaster } from "@/components/ui/sonner"
import Link from "next/link"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const isOrganizer = session?.user?.role === "ORGANIZER"
  const env = process.env.APP_ENV ?? process.env.NEXT_PUBLIC_ENV

  return (
    <SessionProvider session={session}>
      <div className="min-h-screen bg-background flex flex-col">
        {env === "dev" && (
          <div className="bg-amber-400 text-amber-950 text-xs font-bold text-center py-0.5 tracking-wide uppercase">
            DEV environment
          </div>
        )}
        {env === "preview" && (
          <div className="bg-purple-500 text-white text-xs font-bold text-center py-0.5 tracking-wide uppercase">
            PREVIEW environment
          </div>
        )}
        <Nav isOrganizer={isOrganizer} />
        <main className="mx-auto w-full max-w-5xl px-4 py-6 flex-1">{children}</main>
        <footer className="border-t border-border mt-8">
          <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} Empor Lichtenberg</span>
            <span>·</span>
            <Link href="/impressum" className="hover:text-foreground transition-colors">Impressum</Link>
            <span>·</span>
            <Link href="/datenschutz" className="hover:text-foreground transition-colors">Datenschutz</Link>
          </div>
        </footer>
      </div>
      <Toaster />
    </SessionProvider>
  )
}
