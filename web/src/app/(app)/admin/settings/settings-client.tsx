"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { saveEmailFrom, saveRequireApproval } from "./actions"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

export function SettingsClient({ emailFrom, requireApproval }: { emailFrom: string; requireApproval: boolean }) {
  const t = useTranslations("admin.settings")
  const [value, setValue] = useState(emailFrom)
  const [approvalEnabled, setApprovalEnabled] = useState(requireApproval)
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

  function handleToggleApproval(enabled: boolean) {
    setApprovalEnabled(enabled)
    startTransition(async () => {
      try {
        await saveRequireApproval(enabled)
        toast.success(enabled ? t("approvalEnabled") : t("approvalDisabled"))
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("approvalsSection")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{t("approvalTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("approvalDesc")}</p>
            </div>
            <button
              onClick={() => handleToggleApproval(!approvalEnabled)}
              disabled={pending}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                approvalEnabled ? "bg-amber-500" : "bg-muted"
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                approvalEnabled ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
