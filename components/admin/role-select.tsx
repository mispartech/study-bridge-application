"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { ROLE_LABEL, STAFF_ROLES } from "@/lib/auth/roles"

const ROLES = ["student", ...STAFF_ROLES] as const

/** Admins set anyone's role here. Shown read-only to other staff. */
export function RoleSelect({ userId, role, editable }: { userId: string; role: string; editable: boolean }) {
  const router = useRouter()
  const [value, setValue] = React.useState(role)
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  if (!editable) return <p className="text-sm">Role: {ROLE_LABEL[role as keyof typeof ROLE_LABEL] ?? role}</p>

  async function save() {
    if (!confirm(`Change this account's role to ${ROLE_LABEL[value as keyof typeof ROLE_LABEL]}?`)) return
    setBusy(true)
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: value }),
    })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setBusy(false)
    setMessage(res.ok ? "Saved." : (body?.error ?? "That didn't save."))
    if (res.ok) router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        Role
        <select
          className="min-h-11 rounded-button border border-border bg-surface px-3"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      <Button size="sm" variant="secondary" loading={busy} disabled={value === role} onClick={save}>
        Save role
      </Button>
      {message && <span role="status">{message}</span>}
    </div>
  )
}
