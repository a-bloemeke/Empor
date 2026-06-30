import { auth } from "@/auth"
import { NextResponse } from "next/server"

export const proxy = auth((req) => {
  const res = NextResponse.next()

  // Set locale cookie on first visit based on Accept-Language
  if (!req.cookies.get("NEXT_LOCALE")) {
    const lang = req.headers.get("accept-language") ?? ""
    const locale = lang.toLowerCase().startsWith("de") ? "de" : "en"
    res.cookies.set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 })
  }

  const isLoggedIn = !!req.auth
  const isAuthPage = req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/register")

  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", req.nextUrl))
  }

  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/schedule", req.nextUrl))
  }

  return res
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
