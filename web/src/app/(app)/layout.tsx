import { auth } from "@/auth"
import { SessionProvider } from "next-auth/react"
import { Nav } from "@/components/app/nav"
import { Toaster } from "@/components/ui/sonner"
import Link from "next/link"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const isOrganizer = session?.user?.role === "ORGANIZER"

  return (
    <SessionProvider session={session}>
      <div className="min-h-screen bg-background flex flex-col">
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
