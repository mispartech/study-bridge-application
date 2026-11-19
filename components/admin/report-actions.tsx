"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"

export function ReportActions({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  async function close(status: "resolved" | "dismissed") {
    setBusy(true)
    await fetch(`/api/admin/reports/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    })
    setBusy(false)
    router.refresh()
  }
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={busy} onClick={() => close("resolved")}>
        Resolved
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => close("dismissed")}>
        Dismiss
      </Button>
    </div>
  )
}
