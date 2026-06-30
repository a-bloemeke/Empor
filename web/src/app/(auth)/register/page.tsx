"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const t = useTranslations("auth")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: form.get("firstName"),
        lastName: form.get("lastName"),
        email: form.get("email"),
        password: form.get("password"),
      }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? t("registrationFailed"))
    } else {
      router.push("/login")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{t("createAccount")}</CardTitle>
          <CardDescription>{t("joinGroup")}</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">{t("firstName")}</Label>
                <Input id="firstName" name="firstName" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">{t("lastName")}</Label>
                <Input id="lastName" name="lastName" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" name="password" type="password" required autoComplete="new-password" />
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("creatingAccount") : t("createAccount")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("alreadyHaveAccount")}{" "}
              <Link href="/login" className="underline underline-offset-4">
                {t("signIn")}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
