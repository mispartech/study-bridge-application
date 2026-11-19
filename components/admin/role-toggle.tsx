"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"

export function RoleToggle({ userId, admin }: { userId: string; admin: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  async function toggle() {
    if (!confirm(admin ? "Remove admin access for this account?" : "Give this account admin access?")) return
    setBusy(true)
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: admin ? "revoke_admin" : "grant_admin" }),
    })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setBusy(false)
    setMessage(res.ok ? "Saved." : (body?.error ?? "That didn't save."))
    if (res.ok) router.refresh()
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <Button size="sm" variant="secondary" loading={busy} onClick={toggle}>
        {admin ? "Remove admin" : "Make admin"}
      </Button>
      {message && <span role="status">{message}</span>}
    </div>
  )
}
