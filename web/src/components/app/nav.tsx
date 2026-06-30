"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { useTranslations, useLocale } from "next-intl"
import { useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

function setLocaleCookie(locale: string) {
  document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=${60 * 60 * 24 * 365}`
  window.location.reload()
}

export function Nav({ isOrganizer }: { isOrganizer: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const t = useTranslations("nav")
  const locale = useLocale()
  const [menuOpen, setMenuOpen] = useState(false)

  const navLinks = [
    { href: "/schedule", label: t("schedule") },
    { href: "/leaderboard", label: t("leaderboard") },
    ...(isOrganizer ? [{ href: "/admin/seasons", label: t("admin") }] : []),
  ]

  const initials = session?.user?.name
    ? session.user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?"

  return (
    <header className="bg-primary text-primary-foreground shadow-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight shrink-0">
          <span className="text-xl">⚽</span>
          <span>Empor</span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden sm:flex items-center gap-1">
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
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-1">
          {/* Language toggle */}
          <button
            onClick={() => setLocaleCookie(locale === "de" ? "en" : "de")}
            className="hidden sm:block px-2 py-2 rounded text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            {locale === "de" ? "EN" : "DE"}
          </button>

          {/* Mobile hamburger — shows nav links in dropdown */}
          <div className="sm:hidden">
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger className="p-2 rounded-md text-white/80 hover:bg-white/10 transition-colors outline-none">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {menuOpen
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
                </svg>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {navLinks.map((link) => (
                  <DropdownMenuItem key={link.href} onClick={() => { router.push(link.href); setMenuOpen(false) }}>
                    {link.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push(`/players/${session?.user?.id}`)}>
                  {t("profile")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocaleCookie(locale === "de" ? "en" : "de")}>
                  🌐 {locale === "de" ? t("switchToEn") : t("switchToDe")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  {t("signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Avatar dropdown — desktop only */}
          <div className="hidden sm:block">
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
                  {t("profile")}
                </DropdownMenuItem>
                {isOrganizer && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push("/admin/players")}>{t("players")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/admin/membership")}>{t("membershipFees")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/admin/seasons")}>{t("seasons")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/admin/data")}>{t("data")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/admin/settings")}>{t("settings")}</DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocaleCookie(locale === "de" ? "en" : "de")}>
                  🌐 {locale === "de" ? t("switchToEn") : t("switchToDe")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  {t("signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  )
}
