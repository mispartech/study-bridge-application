"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { clearAnalytics } from "@/lib/analytics/consent"
import { track } from "@/lib/analytics/track"
import { clearBrowserProfile } from "@/lib/match/profile-store"

const dated = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

type PlusCardProps = {
  plus: boolean
  renews: string | null
  confirming: boolean
  price: string
  cycle: string
  validUntil: string
}

export function PlusCard({ plus, renews, confirming, price, cycle, validUntil }: PlusCardProps) {
  const [state, setState] = React.useState<"idle" | "starting" | "failed">("idle")

  async function checkout() {
    setState("starting")
    track("plus_checkout_started")
    const res = await fetch("/api/billing/checkout", { method: "POST" })
    const body = (await res.json().catch(() => null)) as { url?: string } | null
    if (res.ok && body?.url) window.location.assign(body.url)
    else setState("failed")
  }

  if (plus) {
    return (
      <Card data-testid="plus-active" className="gap-1">
        <h2 className="font-heading text-lg font-bold">StudyBridge Plus</h2>
        <p className="text-sm text-muted-foreground">Active{renews ? ` until ${dated(renews)}` : ""}.</p>
      </Card>
    )
  }
  return (
    <Card className="gap-2">
      <h2 className="font-heading text-lg font-bold">StudyBridge Plus</h2>
      <p className="text-sm text-muted-foreground">
        Unlimited advisor messages and a bigger shortlist for the {cycle} cycle. One payment of {price}, valid until{" "}
        {dated(validUntil)}.
      </p>
      {confirming && (
        <p className="text-sm" role="status">
          We&apos;re confirming your payment. This can take a minute.
        </p>
      )}
      <Button block loading={state === "starting"} onClick={checkout}>
        Get Plus
      </Button>
      {state === "failed" && (
        <p role="alert" className="text-sm text-danger-strong">
          Checkout isn&apos;t available right now. You haven&apos;t been charged.
        </p>
      )}
    </Card>
  )
}

export function DataControls() {
  const router = useRouter()
  const [typed, setTyped] = React.useState("")
  const [state, setState] = React.useState<"idle" | "deleting" | "failed">("idle")

  async function remove() {
    setState("deleting")
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: typed }),
    })
    if (!res.ok) {
      setState("failed")
      return
    }
    clearBrowserProfile()
    clearAnalytics()
    router.replace("/")
  }

  return (
    <Card className="gap-3">
      <h2 className="font-heading text-lg font-bold">Your data</h2>
      <Button asChild variant="outline" block>
        <a href="/api/account" download="studybridge-data.json">
          Download my data
        </a>
      </Button>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Type DELETE to delete your account and data
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="min-h-11 rounded-button border border-border bg-surface px-3 text-[0.9375rem]"
        />
      </label>
      <Button block variant="outline" disabled={typed !== "DELETE"} loading={state === "deleting"} onClick={remove}>
        Delete my account
      </Button>
      {state === "failed" && (
        <p role="alert" className="text-sm text-danger-strong">
          That didn&apos;t work. Please try again.
        </p>
      )}
    </Card>
  )
}
