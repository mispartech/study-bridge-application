"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"

type Action = "resend" | "delete" | "block"

const CONFIRM: Record<Exclude<Action, "resend">, string> = {
  delete: "Delete this report?",
  block: "Delete this report and block the address from getting another?",
}

export function ReportRowActions({ id, canManage, canErase }: { id: string; canManage: boolean; canErase: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<Action | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)

  async function act(action: Action) {
    if (action !== "resend" && !window.confirm(CONFIRM[action])) return
    setBusy(action)
    const res = await fetch(`/api/admin/emailed-reports/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setBusy(null)
    setMessage(res.ok ? (action === "resend" ? "Resending." : "Done.") : (body?.error ?? "That didn't work."))
    if (res.ok) router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canManage && (
        <Button size="sm" variant="secondary" loading={busy === "resend"} onClick={() => act("resend")}>
          Resend
        </Button>
      )}
      {canErase && (
        <>
          <Button size="sm" variant="ghost" loading={busy === "delete"} onClick={() => act("delete")}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" loading={busy === "block"} onClick={() => act("block")}>
            Block address
          </Button>
        </>
      )}
      {message && (
        <span role="status" className="text-xs">
          {message}
        </span>
      )}
    </div>
  )
}
