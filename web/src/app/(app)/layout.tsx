import { auth } from "@/auth"
import { SessionProvider } from "next-auth/react"
import { Nav } from "@/components/app/nav"
import { Toaster } from "@/components/ui/sonner"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const isOrganizer = session?.user?.role === "ORGANIZER"

  return (
    <SessionProvider session={session}>
      <div className="min-h-screen bg-background">
        <Nav isOrganizer={isOrganizer} />
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </div>
      <Toaster />
    </SessionProvider>
  )
}
