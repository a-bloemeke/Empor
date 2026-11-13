"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { submitMembershipIntent } from "./actions"
import { format } from "date-fns"
import { de } from "date-fns/locale"

type Campaign = {
  year: number
  amount: number
  bankName: string | null
  iban: string | null
  bic: string | null
  paypalHandle: string | null
}

type Fee = {
  status: string
  playerIntent: string | null
  intentAt: string | null
}

function formatIban(iban: string): string {
  return iban.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim()
}

export function MembershipFeeClient({
  campaign,
  fee,
}: {
  campaign: Campaign | null
  fee: Fee | null
}) {
  const [localIntent, setLocalIntent] = useState<string | null>(fee?.playerIntent ?? null)
  const [pending, startTransition] = useTransition()

  if (!campaign) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <h1 className="text-2xl font-bold mb-2">Mitgliedsbeitrag</h1>
        <p className="text-muted-foreground">Derzeit gibt es keine aktive Beitragskampagne.</p>
      </div>
    )
  }

  if (!fee) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <h1 className="text-2xl font-bold mb-2">Mitgliedsbeitrag {campaign.year}</h1>
        <p className="text-muted-foreground">Du bist nicht auf der Mitgliederliste für {campaign.year}. Bitte wende dich an einen Organisator.</p>
      </div>
    )
  }

  function handleIntent(intent: "CONFIRMED" | "DECLINED") {
    startTransition(async () => {
      const res = await submitMembershipIntent(campaign!.year, intent)
      if ("error" in res) { toast.error(res.error); return }
      setLocalIntent(intent)
      toast.success(intent === "CONFIRMED" ? "Danke! Deine Zusage wurde gespeichert." : "Rückmeldung gespeichert.")
    })
  }

  const amountFormatted = campaign.amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })
  const paypalUrl = campaign.paypalHandle
    ? `https://paypal.me/${campaign.paypalHandle.replace(/^@/, "")}`
    : null

  return (
    <div className="max-w-lg mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mitgliedsbeitrag {campaign.year}</h1>
        <p className="text-muted-foreground mt-1">Bitte überweise den Beitrag und gib uns kurz Rückmeldung.</p>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Betrag</span>
          <span className="text-2xl font-bold">{amountFormatted}</span>
        </div>

        {(campaign.bankName || campaign.iban || campaign.bic || campaign.paypalHandle) && (
          <div className="border-t pt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zahlungsdetails</p>
            {campaign.bankName && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bank</span>
                <span className="font-medium">{campaign.bankName}</span>
              </div>
            )}
            {campaign.iban && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">IBAN</span>
                <span className="font-mono font-medium">{formatIban(campaign.iban)}</span>
              </div>
            )}
            {campaign.bic && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">BIC</span>
                <span className="font-medium">{campaign.bic}</span>
              </div>
            )}
            {paypalUrl && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">PayPal</span>
                <a href={paypalUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                  {campaign.paypalHandle}
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {fee.status === "PAID" ? (
        <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-4">
          <p className="text-sm font-medium text-green-800 dark:text-green-300">
            ✅ Beitrag bezahlt
            {fee.intentAt && <span className="font-normal text-green-700 dark:text-green-400"> · {format(new Date(fee.intentAt), "d. MMMM yyyy", { locale: de })}</span>}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {localIntent ? (
            <div className="rounded-xl border p-4">
              <p className="text-sm text-muted-foreground mb-2">Deine Rückmeldung:</p>
              {localIntent === "CONFIRMED" ? (
                <Badge className="bg-green-600 text-white">✅ Ich überweise</Badge>
              ) : (
                <Badge variant="outline" className="border-red-400 text-red-600">❌ Kein Interesse nächstes Jahr</Badge>
              )}
              {fee.intentAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  Gespeichert am {format(new Date(fee.intentAt), "d. MMMM yyyy", { locale: de })}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-3">Du kannst deine Rückmeldung noch ändern:</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Bitte gib uns kurz Rückmeldung:</p>
          )}
          <div className="flex gap-3">
            <Button
              onClick={() => handleIntent("CONFIRMED")}
              disabled={pending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              ✅ Ich überweise
            </Button>
            <Button
              variant="outline"
              onClick={() => handleIntent("DECLINED")}
              disabled={pending}
              className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              ❌ Kein Interesse nächstes Jahr
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
