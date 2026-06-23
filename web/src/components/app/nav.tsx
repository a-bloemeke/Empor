"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const navLinks = [
  { href: "/schedule", label: "Schedule" },
  { href: "/leaderboard", label: "Leaderboard" },
]

export function Nav({ isOrganizer }: { isOrganizer: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()

  const initials = session?.user?.name
    ? session.user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?"

  return (
    <header className="bg-primary text-primary-foreground shadow-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <span className="text-xl">⚽</span>
            <span>Empor</span>
          </Link>
          <nav className="flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  pathname.startsWith(link.href)
                    ? "bg-white/20 text-white"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                )}
              >
                {link.label}
              </Link>
            ))}
            {isOrganizer && (
              <Link
                href="/admin/seasons"
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  pathname.startsWith("/admin")
                    ? "bg-white/20 text-white"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                )}
              >
                Admin
              </Link>
            )}
          </nav>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full outline-none ring-offset-2 ring-offset-primary focus-visible:ring-2 focus-visible:ring-white">
            <Avatar className="h-8 w-8 cursor-pointer border-2 border-white/30">
              <AvatarFallback className="text-xs bg-white/20 text-white">{initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-2 py-1.5 text-sm font-medium">{session?.user?.name}</div>
            <div className="px-2 pb-1.5 text-xs text-muted-foreground">{session?.user?.email}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push(`/players/${session?.user?.id}`)}>
              Profile
            </DropdownMenuItem>
            {isOrganizer && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/admin/players")}>
                  Players
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/admin/membership")}>
                  Membership Fees
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/admin/seasons")}>
                  Seasons
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/admin/data")}>
                  Data
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
