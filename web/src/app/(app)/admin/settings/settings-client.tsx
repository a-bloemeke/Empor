"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { saveEmailFrom } from "./actions"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

export function SettingsClient({ emailFrom }: { emailFrom: string }) {
  const t = useTranslations("admin.settings")
  const [value, setValue] = useState(emailFrom)
  const [pending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      try {
        await saveEmailFrom(value)
        toast.success(t("saved"))
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("emailSection")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="emailFrom">{t("emailFrom")}</Label>
            <p className="text-xs text-muted-foreground">{t("emailFromHint")}</p>
            <div className="flex gap-2 max-w-sm">
              <Input
                id="emailFrom"
                type="email"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="noreply@yourdomain.com"
              />
              <Button onClick={handleSave} disabled={pending || !value.trim()}>
                {pending ? t("saving") : t("save")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
