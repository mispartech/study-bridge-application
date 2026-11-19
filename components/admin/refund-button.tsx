"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"

export function RefundButton({ reference }: { reference: string }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)

  async function refund() {
    const reason = window.prompt("Reason for the refund (recorded in the audit log):")
    if (!reason || reason.trim().length < 3) return
    setBusy(true)
    const res = await fetch(`/api/admin/payments/${encodeURIComponent(reference)}/refund`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setBusy(false)
    setMessage(res.ok ? "Refunded." : (body?.error ?? "That didn't work."))
    if (res.ok) router.refresh()
  }

  return (
    <span className="flex items-center gap-2">
      <Button size="sm" variant="ghost" loading={busy} onClick={refund}>
        Refund
      </Button>
      {message && (
        <span role="status" className="text-xs">
          {message}
        </span>
      )}
    </span>
  )
}
