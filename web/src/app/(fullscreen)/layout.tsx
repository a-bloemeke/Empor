import { SessionProvider } from "next-auth/react"
import { auth } from "@/auth"
import { Toaster } from "@/components/ui/sonner"

export default async function FullscreenLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <SessionProvider session={session}>
      <div className="min-h-screen bg-background">{children}</div>
      <Toaster />
    </SessionProvider>
  )
}
